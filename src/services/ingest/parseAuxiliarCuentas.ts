import type ExcelJS from "exceljs";
import { cellText, normalizeToken, optionalNumber } from "@/services/ingest/cells";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import type { MappingProfileShape } from "@/services/ingest/types";
import type {
  AuxiliarCuentaResumenRow,
  AuxiliarMovimientoRow,
  QualityIssue,
} from "@/services/ingestionTypes";
import { round2 } from "@/services/money";

const ACCOUNT_RE = /^\d{4}-\d{4}-\d{4}-\d{4}$/;
const MAYOR_RE = /^\d{4}-0000-0000-0000$/;
const DATE_TEXT_RE = /^(\d{1,2})\/([A-Za-z]{3,})\/(\d{4})$/;

const MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

export type AuxiliarCuentasParseResult = {
  movimientos: AuxiliarMovimientoRow[];
  resumen: AuxiliarCuentaResumenRow[];
  moneda: string;
  warnings: QualityIssue[];
};

type AccountSection = {
  row: number;
  idCuenta: string;
  nombreCuenta: string;
  saldoInicial: number;
  sumCargos: number;
  sumAbonos: number;
  totalRow: { cargos: number; abonos: number; saldoFinal: number } | null;
};

function parseFecha(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const match = cellText(value).match(DATE_TEXT_RE);
  if (!match) {
    return null;
  }
  const mes = MONTHS[match[2]!.toLowerCase().slice(0, 3)];
  if (!mes) {
    return null;
  }
  return new Date(Date.UTC(Number(match[3]), mes - 1, Number(match[1])));
}

function detectMoneda(worksheet: ExcelJS.Worksheet, filename: string): { moneda: string; known: boolean } {
  const headerRows = Math.min(6, worksheet.rowCount);
  for (let r = 1; r <= headerRows; r += 1) {
    const text = normalizeToken(cellText(worksheet.getRow(r).getCell(1).value));
    const match = text.match(/^moneda_(.+)$/);
    if (match) {
      const raw = match[1]!;
      if (raw.includes("peso")) return { moneda: "MXN", known: true };
      if (raw.includes("dolar")) return { moneda: "USD", known: true };
      return { moneda: raw.slice(0, 8).toUpperCase(), known: true };
    }
  }
  const name = normalizeToken(filename);
  if (name.includes("usd") || name.includes("dolar")) return { moneda: "USD", known: true };
  if (name.includes("mxn") || name.includes("peso")) return { moneda: "MXN", known: true };
  return { moneda: "MXN", known: false };
}

/**
 * Parser del reporte CONTPAQi "Movimientos, Auxiliares del Catálogo" (06/07).
 * Estructura: encabezado con moneda y rango de fechas; por cada cuenta, una fila
 * de apertura con "Saldo inicial :", movimientos diarios (fecha, tipo, número,
 * concepto, referencia, cargos, abonos, saldo) y una fila "Total:" de cierre.
 */
export function parseAuxiliarCuentasSheet(
  worksheet: ExcelJS.Worksheet,
  profile: MappingProfileShape,
  periodo: number,
  anio: number,
  filename: string,
): AuxiliarCuentasParseResult {
  const warnings: QualityIssue[] = [];
  const { moneda, known } = detectMoneda(worksheet, filename);
  if (!known) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: no se detectó la moneda en el encabezado; se asumió MXN.`,
      sheet: worksheet.name,
    });
  }

  const movimientos: AuxiliarMovimientoRow[] = [];
  const sections: AccountSection[] = [];
  let current: AccountSection | null = null;
  let fueraDePeriodo = 0;

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const first = cellText(row.getCell(1).value);

    if (ACCOUNT_RE.test(first)) {
      current = {
        row: rowNumber,
        idCuenta: first,
        nombreCuenta: cellText(row.getCell(2).value) || first,
        saldoInicial: optionalNumber(row.getCell(8).value),
        sumCargos: 0,
        sumAbonos: 0,
        totalRow: null,
      };
      sections.push(current);
      continue;
    }

    const totalToken = normalizeToken(cellText(row.getCell(5).value));
    if (totalToken === "total" && current) {
      current.totalRow = {
        cargos: round2(optionalNumber(row.getCell(6).value)),
        abonos: round2(optionalNumber(row.getCell(7).value)),
        saldoFinal: round2(optionalNumber(row.getCell(8).value)),
      };
      // La fila "Total:" cierra la sección; sin esto, el Total de la cuenta de
      // cuadre (_CUADRE, sin código numérico) sobrescribiría el de la sección previa.
      current = null;
      continue;
    }

    const fecha = parseFecha(row.getCell(1).value);
    if (!fecha || !current) {
      continue;
    }
    const tipoPoliza = cellText(row.getCell(2).value);
    if (!tipoPoliza) {
      continue;
    }
    const cargos = round2(optionalNumber(row.getCell(6).value));
    const abonos = round2(optionalNumber(row.getCell(7).value));
    current.sumCargos = round2(current.sumCargos + cargos);
    current.sumAbonos = round2(current.sumAbonos + abonos);
    if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() + 1 !== periodo) {
      fueraDePeriodo += 1;
    }
    movimientos.push({
      row: rowNumber,
      moneda,
      idCuenta: current.idCuenta,
      nombreCuenta: current.nombreCuenta,
      fecha,
      tipoPoliza,
      numeroPoliza: cellText(row.getCell(3).value),
      concepto: cellText(row.getCell(4).value),
      referencia: cellText(row.getCell(5).value),
      cargos,
      abonos,
      saldo: round2(optionalNumber(row.getCell(8).value)),
      periodo,
      anio,
    });
  }

  const leafCodes = selectLeafCodes(sections.map((section) => section.idCuenta));
  const resumen: AuxiliarCuentaResumenRow[] = [];
  for (const section of sections) {
    if (MAYOR_RE.test(section.idCuenta) || !leafCodes.has(section.idCuenta)) {
      continue;
    }
    const cargos = section.totalRow?.cargos ?? section.sumCargos;
    const abonos = section.totalRow?.abonos ?? section.sumAbonos;
    if (section.totalRow) {
      if (Math.abs(section.totalRow.cargos - section.sumCargos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `${section.idCuenta} ${section.nombreCuenta}: la suma de cargos parseados (${section.sumCargos.toFixed(2)}) difiere del Total reportado (${section.totalRow.cargos.toFixed(2)}).`,
          sheet: worksheet.name,
          row: section.row,
        });
      }
      if (Math.abs(section.totalRow.abonos - section.sumAbonos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `${section.idCuenta} ${section.nombreCuenta}: la suma de abonos parseados (${section.sumAbonos.toFixed(2)}) difiere del Total reportado (${section.totalRow.abonos.toFixed(2)}).`,
          sheet: worksheet.name,
          row: section.row,
        });
      }
    }
    resumen.push({
      moneda,
      idCuenta: section.idCuenta,
      nombreCuenta: section.nombreCuenta,
      saldoInicial: round2(section.saldoInicial),
      cargos,
      abonos,
      saldoFinal: section.totalRow?.saldoFinal ?? round2(section.saldoInicial + cargos - abonos),
      periodo,
      anio,
    });
  }

  if (movimientos.length === 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "El auxiliar de cuentas no produjo movimientos.",
      sheet: worksheet.name,
    });
  }
  if (fueraDePeriodo > 0) {
    warnings.push({
      rule: "PERIODO",
      severity: "WARNING",
      message: `${fueraDePeriodo} movimientos tienen fecha fuera del periodo ${periodo}/${anio} detectado.`,
      sheet: worksheet.name,
    });
  }
  return { movimientos, resumen, moneda, warnings };
}
