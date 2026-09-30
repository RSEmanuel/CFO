import * as XLSX from "xlsx";
import { round2 } from "@/services/money";
import type { PolizaMovimientoRow, PolizaRow, QualityIssue } from "@/services/ingestionTypes";

/**
 * Parser del reporte CONTPAQi "Diarios y Pólizas" (impreso de pólizas).
 *
 * Estructura real observada (08. Diarios y Polizas 31.07.26.xlsx, 2,849 filas):
 *   - Encabezado (filas 1-5): empresa, "Impreso de pólizas del DD/Mmm/YYYY al
 *     DD/Mmm/YYYY" (de aquí se infiere el periodo), moneda, RFC.
 *   - Filas 6-7: encabezados de columna (Fecha/Tipo/Número/Concepto y
 *     No./Refer./Cuenta/Nombre/Cargos/Abonos).
 *   - Bloque por póliza:
 *       encabezado: [fecha texto] [tipo] [número] [concepto]
 *       movimiento: [no.] [referencia] [cuenta] [nombre] ... [cargo] [abono]
 *       concepto del movimiento (opcional): solo [3] con texto
 *       cierre: [1]"Cifra de Control" [5]"Total póliza :" [6]cargos [7]abonos
 *   - Después de cada póliza vienen secciones informativas (CFD/CFDI asociados,
 *     complementos de pago) que SE IGNORAN: sus filas imitan encabezados de
 *     póliza (fecha + tipo + folio numérico, p. ej. nóminas con folio 2026),
 *     así que un encabezado solo es válido si 1-2 filas después viene el
 *     primer movimiento ([0] numérico + código de cuenta). Con esa regla el
 *     reporte da exactamente las 112 pólizas / 749 movimientos que el propio
 *     pie declara ("Total de pólizas impresas / movimientos impresos").
 *   - Subtotales por día ("Total al DD/Mmm/YYYY :") y al final
 *     "T o t a l   G e n e r a l :" + totales impresos del reporte.
 *
 * El número de póliza es único por tipo dentro del periodo (Ingresos 1-18,
 * Egresos 1-47, Diario 1-49 en jul-2026), lo que habilita el constraint
 * (tenant, anio, periodo, tipo, numero) para idempotencia.
 */

export interface ContpaqPolizasParseResult {
  polizas: PolizaRow[];
  movimientos: PolizaMovimientoRow[];
  periodo: number | null;
  anio: number | null;
  /** Pólizas donde Σ cargos ≠ Σ abonos (se persisten marcadas con cuadrada=false). */
  descuadradas: number;
  /** Totales declarados en el pie del reporte (última ocurrencia). */
  esperadasPolizas: number | null;
  esperadosMovimientos: number | null;
  warnings: QualityIssue[];
}

export interface ContpaqPolizasParseOptions {
  filename?: string;
  /** Fallback cuando el encabezado no trae rango "del ... al ...". */
  periodo?: number;
  anio?: number;
  sheetName?: string;
}

/** Código de cuenta CONTPAQi: 105-01-042, 1105-0001-0040-0000, etc. */
const ACCOUNT_RE = /^\d{2,4}(-\d{2,5})+$/;
const DATE_TEXT_RE = /^(\d{1,2})[/\-.]([A-Za-z]{3,}|\d{1,2})[/\-.](\d{4})$/;
const PERIOD_RANGE_RE = /del\s+(\d{1,2}\/[A-Za-z]{3,}\/\d{4})\s+al\s+(\d{1,2}\/[A-Za-z]{3,}\/\d{4})/i;
const TOTAL_POLIZAS_RE = /total de p[óo]lizas impresas\s*:\s*(\d+)/i;
const TOTAL_MOVIMIENTOS_RE = /total de movimientos impresos\s*:\s*(\d+)/i;

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

type CellValue = string | number | Date | null | undefined;
type GridRow = CellValue[];

type PolizaBlock = {
  row: number;
  tipo: string;
  numero: number;
  fecha: Date;
  concepto: string;
  sumCargos: number;
  sumAbonos: number;
  movimientosCount: number;
  totalRow: { cargos: number; abonos: number } | null;
};

function text(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

const COMBINING_MARKS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeToken(value: CellValue): string {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS_RE, "")
    .replace(/\s+/g, "_");
}

function num(value: CellValue): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = value.replace(/[$\s,]/g, "").replace(/\((.+)\)/, "-$1");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseFecha(value: CellValue): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const match = text(value).match(DATE_TEXT_RE);
  if (!match) return null;
  const dia = Number(match[1]);
  const mesToken = match[2]!.toLowerCase();
  const mes = /^\d+$/.test(mesToken) ? Number(mesToken) : MONTHS[mesToken.slice(0, 3)];
  if (!mes || mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(Number(match[3]), mes - 1, dia));
}

function detectPeriodo(rows: GridRow[]): { periodo: number; anio: number } | null {
  for (const row of rows.slice(0, 8)) {
    const match = text(row[0]).match(PERIOD_RANGE_RE);
    if (!match) continue;
    const fin = parseFecha(match[2]);
    if (fin) {
      return { periodo: fin.getUTCMonth() + 1, anio: fin.getUTCFullYear() };
    }
  }
  return null;
}

function toGrid(worksheet: XLSX.WorkSheet): GridRow[] {
  const raw = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  return raw.map((row) => (Array.isArray(row) ? row : []));
}

/** Fila de movimiento: [0] número de movimiento y [2] código de cuenta. */
function isMovimientoRow(row: GridRow | undefined): row is GridRow {
  return Boolean(row) && typeof row![0] === "number" && ACCOUNT_RE.test(text(row![2]));
}

/**
 * Encabezado de póliza candidato: fecha texto + tipo + número. Las secciones
 * de CFDI/complementos producen falsos positivos con el mismo patrón, así que
 * solo se acepta si el primer movimiento aparece 1-2 filas después, o si la
 * fila siguiente ya es el cierre "Cifra de Control" (póliza vacía/anulada con
 * total 0/0, p. ej. Egresos 6 de jun-2026 — el pie del reporte sí la cuenta).
 */
function isPolizaHeaderRow(rows: GridRow[], index: number): boolean {
  const row = rows[index]!;
  const c0 = text(row[0]);
  const c1 = text(row[1]);
  if (!DATE_TEXT_RE.test(c0) || !c1 || typeof row[2] !== "number") return false;
  const next1 = rows[index + 1];
  return (
    isMovimientoRow(next1) ||
    isMovimientoRow(rows[index + 2]) ||
    (Boolean(next1) && isPolizaTotalRow(next1!))
  );
}

/** Cierre de póliza: [1]"Cifra de Control" ... [5]"Total póliza :" [6] [7]. */
function isPolizaTotalRow(row: GridRow): boolean {
  return (
    normalizeToken(row[1]) === "cifra_de_control" ||
    normalizeToken(row[5]).replace(/_+$/, "").startsWith("total_poliza")
  );
}

/** Fila de concepto del movimiento anterior: solo [3] con texto. */
function isConceptoRow(row: GridRow): boolean {
  return (
    text(row[0]) === "" &&
    text(row[1]) === "" &&
    row[2] == null &&
    text(row[3]) !== "" &&
    row[6] == null &&
    row[7] == null
  );
}

export function parseContpaqPolizas(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  options: ContpaqPolizasParseOptions = {},
): ContpaqPolizasParseResult {
  const warnings: QualityIssue[] = [];
  const filename = options.filename ?? "";

  const workbook = Buffer.isBuffer(buffer)
    ? XLSX.read(buffer, { type: "buffer", cellDates: true })
    : XLSX.read(new Uint8Array(buffer as ArrayBuffer | Uint8Array), {
        type: "array",
        cellDates: true,
      });
  const sheetName =
    options.sheetName && workbook.SheetNames.includes(options.sheetName)
      ? options.sheetName
      : workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!worksheet) {
    return {
      polizas: [],
      movimientos: [],
      periodo: options.periodo ?? null,
      anio: options.anio ?? null,
      descuadradas: 0,
      esperadasPolizas: null,
      esperadosMovimientos: null,
      warnings: [
        {
          rule: "PARSEO",
          severity: "ERROR",
          message: `${filename || "archivo"}: no se encontró ninguna hoja de cálculo.`,
        },
      ],
    };
  }

  const rows = toGrid(worksheet);
  const detectedPeriod = detectPeriodo(rows);
  const periodo = detectedPeriod?.periodo ?? options.periodo ?? null;
  const anio = detectedPeriod?.anio ?? options.anio ?? null;
  if (!periodo || !anio) {
    warnings.push({
      rule: "PERIODO",
      severity: "ERROR",
      message: `${filename}: no se pudo inferir el periodo del reporte ni se recibió uno explícito.`,
      sheet: sheetName,
    });
  }

  const blocks: PolizaBlock[] = [];
  const movimientos: PolizaMovimientoRow[] = [];
  let current: PolizaBlock | null = null;
  let lastMovimiento: PolizaMovimientoRow | null = null;
  let esperadasPolizas: number | null = null;
  let esperadosMovimientos: number | null = null;
  let fueraDePeriodo = 0;
  let movimientosHuerfanos = 0;

  const closeBlock = (rowNumber: number) => {
    if (!current) return;
    if (!current.totalRow) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: `Póliza ${current.tipo} ${current.numero}: no se encontró la fila "Total póliza"; se usaron las sumas de movimientos.`,
        sheet: sheetName,
        row: rowNumber,
      });
    }
    blocks.push(current);
    current = null;
    lastMovimiento = null;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;

    const polizasMatch = text(row[0]).match(TOTAL_POLIZAS_RE);
    if (polizasMatch) {
      esperadasPolizas = Number(polizasMatch[1]);
      return;
    }
    const movimientosMatch = text(row[0]).match(TOTAL_MOVIMIENTOS_RE);
    if (movimientosMatch) {
      esperadosMovimientos = Number(movimientosMatch[1]);
      return;
    }

    if (isPolizaHeaderRow(rows, index)) {
      closeBlock(rowNumber);
      const fecha = parseFecha(row[0]);
      if (!fecha) return;
      if (periodo && anio && (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() + 1 !== periodo)) {
        fueraDePeriodo += 1;
      }
      current = {
        row: rowNumber,
        tipo: text(row[1]),
        numero: Number(row[2]),
        fecha,
        concepto: text(row[3]),
        sumCargos: 0,
        sumAbonos: 0,
        movimientosCount: 0,
        totalRow: null,
      };
      return;
    }

    if (isPolizaTotalRow(row)) {
      if (current) {
        current.totalRow = { cargos: round2(num(row[6])), abonos: round2(num(row[7])) };
        closeBlock(rowNumber);
      }
      return;
    }

    if (isMovimientoRow(row)) {
      if (!current) {
        movimientosHuerfanos += 1;
        return;
      }
      const cargo = round2(num(row[6]));
      const abono = round2(num(row[7]));
      current.sumCargos = round2(current.sumCargos + cargo);
      current.sumAbonos = round2(current.sumAbonos + abono);
      current.movimientosCount += 1;
      lastMovimiento = {
        row: rowNumber,
        tipoPoliza: current.tipo,
        numeroPoliza: current.numero,
        numeroMovimiento: Number(row[0]),
        codigoCuenta: text(row[2]),
        nombreCuenta: text(row[3]),
        referencia: text(row[1]),
        concepto: "",
        cargo,
        abono,
        periodo: periodo ?? 0,
        anio: anio ?? 0,
      };
      movimientos.push(lastMovimiento);
      return;
    }

    if (current && lastMovimiento && isConceptoRow(row)) {
      const concepto = text(row[3]);
      lastMovimiento.concepto = lastMovimiento.concepto
        ? `${lastMovimiento.concepto} / ${concepto}`
        : concepto;
      return;
    }

    // Subtotales de día ("Total al ...") cierran cualquier bloque colgado.
    if (normalizeToken(row[5]).startsWith("total_al_")) {
      closeBlock(rowNumber);
    }
  });
  closeBlock(rows.length);

  const polizas: PolizaRow[] = [];
  let descuadradas = 0;
  for (const block of blocks) {
    const totalCargos = block.totalRow?.cargos ?? block.sumCargos;
    const totalAbonos = block.totalRow?.abonos ?? block.sumAbonos;
    if (block.totalRow) {
      if (Math.abs(block.totalRow.cargos - block.sumCargos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `Póliza ${block.tipo} ${block.numero}: la suma de cargos parseados (${block.sumCargos.toFixed(2)}) difiere del Total póliza reportado (${block.totalRow.cargos.toFixed(2)}).`,
          sheet: sheetName,
          row: block.row,
        });
      }
      if (Math.abs(block.totalRow.abonos - block.sumAbonos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `Póliza ${block.tipo} ${block.numero}: la suma de abonos parseados (${block.sumAbonos.toFixed(2)}) difiere del Total póliza reportado (${block.totalRow.abonos.toFixed(2)}).`,
          sheet: sheetName,
          row: block.row,
        });
      }
    }
    const cuadrada = Math.abs(totalCargos - totalAbonos) <= 0.01;
    if (!cuadrada) {
      descuadradas += 1;
      warnings.push({
        rule: "PARTIDA_DOBLE",
        severity: "WARNING",
        message: `Póliza ${block.tipo} ${block.numero} descuadrada: cargos ${totalCargos.toFixed(2)} ≠ abonos ${totalAbonos.toFixed(2)}. Se persiste marcada.`,
        sheet: sheetName,
        row: block.row,
      });
    }
    polizas.push({
      row: block.row,
      tipo: block.tipo,
      numero: block.numero,
      fecha: block.fecha,
      concepto: block.concepto,
      totalCargos,
      totalAbonos,
      cuadrada,
      movimientosCount: block.movimientosCount,
      periodo: periodo ?? 0,
      anio: anio ?? 0,
    });
  }

  if (esperadasPolizas != null && esperadasPolizas !== polizas.length) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: el reporte declara ${esperadasPolizas} pólizas impresas pero se parsearon ${polizas.length}.`,
      sheet: sheetName,
    });
  }
  if (esperadosMovimientos != null && esperadosMovimientos !== movimientos.length) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: el reporte declara ${esperadosMovimientos} movimientos impresos pero se parsearon ${movimientos.length}.`,
      sheet: sheetName,
    });
  }
  if (movimientosHuerfanos > 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: ${movimientosHuerfanos} movimientos aparecen fuera de un bloque de póliza y se ignoraron.`,
      sheet: sheetName,
    });
  }
  if (fueraDePeriodo > 0) {
    warnings.push({
      rule: "PERIODO",
      severity: "WARNING",
      message: `${fueraDePeriodo} pólizas tienen fecha fuera del periodo ${periodo}/${anio} detectado.`,
      sheet: sheetName,
    });
  }
  if (polizas.length === 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: no se encontraron pólizas en el reporte.`,
      sheet: sheetName,
    });
  }

  return {
    polizas,
    movimientos,
    periodo,
    anio,
    descuadradas,
    esperadasPolizas,
    esperadosMovimientos,
    warnings,
  };
}

/** Subconjunto de delegates de Prisma que la persistencia necesita (testeable con mocks). */
export interface PolizasPersistenceClient {
  poliza: {
    deleteMany(args: { where: { tenantId: string; anio: number; periodo: number } }): Promise<unknown>;
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
  };
  polizaMovimiento: {
    deleteMany(args: { where: { tenantId: string; anio: number; periodo: number } }): Promise<unknown>;
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: PolizasPersistenceClient) => Promise<T>): Promise<T>;
}

const CREATE_MANY_CHUNK = 800;

/**
 * Persiste las pólizas parseadas de forma idempotente: borra pólizas y
 * movimientos del periodo completo (tenant, anio, periodo) y reinserta.
 */
export async function persistPolizasContpaq(
  client: PolizasPersistenceClient,
  tenantId: string,
  result: ContpaqPolizasParseResult,
): Promise<{ polizas: number; movimientos: number; descuadradas: number }> {
  if (!result.periodo || !result.anio) {
    throw new Error("El resultado del parser no tiene periodo/anio resueltos; no se puede persistir.");
  }
  const periodo = result.periodo;
  const anio = result.anio;

  await client.$transaction(async (tx) => {
    await tx.polizaMovimiento.deleteMany({ where: { tenantId, anio, periodo } });
    await tx.poliza.deleteMany({ where: { tenantId, anio, periodo } });

    const polizaRows = result.polizas.map((row) => ({
      tenantId,
      anio,
      periodo,
      tipo: row.tipo,
      numero: row.numero,
      fecha: row.fecha,
      concepto: row.concepto,
      totalCargos: row.totalCargos,
      totalAbonos: row.totalAbonos,
      cuadrada: row.cuadrada,
      movimientosCount: row.movimientosCount,
    }));
    for (let index = 0; index < polizaRows.length; index += CREATE_MANY_CHUNK) {
      await tx.poliza.createMany({ data: polizaRows.slice(index, index + CREATE_MANY_CHUNK) });
    }

    const movimientoRows = result.movimientos.map((row) => ({
      tenantId,
      anio,
      periodo,
      tipoPoliza: row.tipoPoliza,
      numeroPoliza: row.numeroPoliza,
      numeroMovimiento: row.numeroMovimiento,
      codigoCuenta: row.codigoCuenta,
      nombreCuenta: row.nombreCuenta,
      referencia: row.referencia,
      concepto: row.concepto,
      cargo: row.cargo,
      abono: row.abono,
    }));
    for (let index = 0; index < movimientoRows.length; index += CREATE_MANY_CHUNK) {
      await tx.polizaMovimiento.createMany({ data: movimientoRows.slice(index, index + CREATE_MANY_CHUNK) });
    }
  });

  return {
    polizas: result.polizas.length,
    movimientos: result.movimientos.length,
    descuadradas: result.descuadradas,
  };
}
