import ExcelJS from "exceljs";
import type { CategoriaMaestra } from "@/generated/prisma/enums";
import { classifyCategoria, isDepreciation } from "@/services/ingest/accountClassify";
import { cellText, optionalNumber, normalizeToken } from "@/services/ingest/cells";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { parseAuxiliarCuentasSheet } from "@/services/ingest/parseAuxiliarCuentas";
import { parseFlujoEfectivoSheet } from "@/services/ingest/parseFlujoEfectivo";
import { parseContpaqPolizas } from "@/lib/parsers/contpaq-polizas-parser";
import type { ColumnMap, MappingProfileShape } from "@/services/ingest/types";
import type { BalanzaRow, MasterWorkbook, QualityIssue } from "@/services/ingestionTypes";
import { parseMasterWorkbook } from "@/services/workbookParser";

function emptyWorkbook(): MasterWorkbook {
  return {
    balanza: [],
    ventas: [],
    egresos: [],
    tesoreria: [],
    tesoreriaDetalle: [],
    auxiliarMovimientos: [],
    auxiliarResumen: [],
    polizas: [],
    polizaMovimientos: [],
  };
}

function resolveColumn(headers: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const colMatch = alias.match(/^__col:(\d+)$/);
    if (colMatch) {
      return Number(colMatch[1]);
    }
    const idx = headers.get(alias) ?? headers.get(normalizeToken(alias));
    if (idx) {
      return idx;
    }
  }
  return null;
}

function headerMap(worksheet: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  const current = worksheet.getRow(headerRow);
  const previous = headerRow > 1 ? worksheet.getRow(headerRow - 1) : null;
  current.eachCell({ includeEmpty: true }, (cell, col) => {
    const here = normalizeToken(cellText(cell.value));
    const above = previous ? normalizeToken(cellText(previous.getCell(col).value)) : "";
    if (here) map.set(here, col);
    if (above) map.set(above, col);
    if (above && here) map.set(`${above}_${here}`, col);
  });
  return map;
}

function signedSaldo(deudor: number, acreedor: number): number {
  return deudor - acreedor;
}

function parseBalanzaSheet(
  worksheet: ExcelJS.Worksheet,
  profile: MappingProfileShape,
  periodo: number,
  anio: number,
): BalanzaRow[] {
  const headers = headerMap(worksheet, profile.headerRow);
  const col = (field: keyof ColumnMap | string) =>
    resolveColumn(headers, profile.columnMap[field] ?? []);
  const idCol = col("idCuenta");
  const nameCol = col("nombreCuenta");
  const debeCol = col("debe");
  const haberCol = col("haber");
  if (!idCol || !nameCol || !debeCol || !haberCol) {
    return [];
  }
  const iniDeudor = col("saldoInicialDeudor");
  const iniAcreedor = col("saldoInicialAcreedor");
  const finDeudor = col("saldoFinalDeudor");
  const finAcreedor = col("saldoFinalAcreedor");
  const saldoIni = col("saldoInicial");
  const saldoFin = col("saldoFinal");
  const catCol = col("categoriaMaestra");
  const presupuestoCol = col("montoPresupuestado");
  const daCol = col("depreciacionAmortizacion");
  const periodoCol = col("periodo");
  const anioCol = col("anio");

  const start = profile.headerRow + 1;
  const parsed: BalanzaRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= start) {
      return;
    }
    const idCuenta = cellText(row.getCell(idCol).value);
    if (!/^\d/.test(idCuenta)) {
      return;
    }
    const nombreCuenta = cellText(row.getCell(nameCol).value) || idCuenta;
    const debe = optionalNumber(row.getCell(debeCol).value);
    const haber = optionalNumber(row.getCell(haberCol).value);
    const saldoInicial =
      saldoIni != null
        ? optionalNumber(row.getCell(saldoIni).value)
        : signedSaldo(
            iniDeudor ? optionalNumber(row.getCell(iniDeudor).value) : 0,
            iniAcreedor ? optionalNumber(row.getCell(iniAcreedor).value) : 0,
          );
    const saldoFinal =
      saldoFin != null
        ? optionalNumber(row.getCell(saldoFin).value)
        : signedSaldo(
            finDeudor ? optionalNumber(row.getCell(finDeudor).value) : 0,
            finAcreedor ? optionalNumber(row.getCell(finAcreedor).value) : 0,
          );
    const rawCat = catCol ? cellText(row.getCell(catCol).value) : "";
    const categoriaMaestra = (
      ["Activo", "Pasivo", "Patrimonio", "Ingreso", "COGS", "OpEx"].includes(rawCat)
        ? rawCat
        : classifyCategoria(idCuenta, nombreCuenta, profile.accountPrefixRules)
    ) as CategoriaMaestra;
    parsed.push({
      row: rowNumber,
      idCuenta,
      nombreCuenta,
      categoriaMaestra,
      saldoInicial,
      debe,
      haber,
      saldoFinal,
      montoPresupuestado: presupuestoCol ? optionalNumber(row.getCell(presupuestoCol).value) : 0,
      depreciacionAmortizacion: daCol
        ? /true|1|si|sí|yes/i.test(cellText(row.getCell(daCol).value))
        : isDepreciation(nombreCuenta, idCuenta),
      periodo: periodoCol ? Math.trunc(optionalNumber(row.getCell(periodoCol).value)) || periodo : periodo,
      anio: anioCol ? Math.trunc(optionalNumber(row.getCell(anioCol).value)) || anio : anio,
    });
  });

  if (!profile.accountPrefixRules?.leafOnly) {
    return parsed;
  }
  const leaves = selectLeafCodes(parsed.map((row) => row.idCuenta));
  return parsed.filter((row) => leaves.has(row.idCuenta));
}

export async function mapToMasterWorkbook(input: {
  buffer: Buffer;
  filename: string;
  documentType: string;
  sourceSystem: string;
  sheetName: string | null;
  profile: MappingProfileShape | null;
  periodo: number;
  anio: number;
}): Promise<{ workbook: MasterWorkbook; warnings: QualityIssue[] }> {
  const warnings: QualityIssue[] = [];
  if (input.documentType === "master_workbook") {
    return { workbook: await parseMasterWorkbook(input.buffer, input.filename), warnings };
  }

  if (input.documentType === "flujo_efectivo") {
    if (!input.profile?.flujoConfig) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: "El reporte de flujo de efectivo requiere un perfil con tokens de sección (flujoConfig). No se persistió.",
      });
      return { workbook: emptyWorkbook(), warnings };
    }
    const flujoWorkbook = new ExcelJS.Workbook();
    await flujoWorkbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
    const flujoNeedle = (input.profile.sheetMatch ?? "").toLowerCase();
    const flujoSheet =
      flujoWorkbook.worksheets.find((sheet) =>
        sheet.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(flujoNeedle),
      ) ?? flujoWorkbook.worksheets[0];
    if (!flujoSheet) {
      warnings.push({
        rule: "PARSEO",
        severity: "ERROR",
        message: "No se encontró una hoja para mapear el flujo de efectivo.",
      });
      return { workbook: emptyWorkbook(), warnings };
    }
    const parsed = parseFlujoEfectivoSheet(flujoSheet, input.profile, input.periodo, input.anio);
    warnings.push(...parsed.warnings);
    return {
      workbook: {
        ...emptyWorkbook(),
        tesoreria: parsed.tesoreria,
        tesoreriaDetalle: parsed.detalle,
      },
      warnings,
    };
  }

  if (input.documentType === "auxiliar_cuentas") {
    if (!input.profile) {
      warnings.push({
        rule: "PARSEO",
        severity: "WARNING",
        message: "El auxiliar de cuentas requiere un perfil de mapeo. No se persistió.",
      });
      return { workbook: emptyWorkbook(), warnings };
    }
    const auxWorkbook = new ExcelJS.Workbook();
    await auxWorkbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
    const auxNeedle = (input.profile.sheetMatch ?? "").toLowerCase();
    const auxSheet =
      auxWorkbook.worksheets.find((sheet) =>
        sheet.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(auxNeedle),
      ) ?? auxWorkbook.worksheets[0];
    if (!auxSheet) {
      warnings.push({
        rule: "PARSEO",
        severity: "ERROR",
        message: "No se encontró una hoja para mapear el auxiliar de cuentas.",
      });
      return { workbook: emptyWorkbook(), warnings };
    }
    const parsed = parseAuxiliarCuentasSheet(auxSheet, input.profile, input.periodo, input.anio, input.filename);
    warnings.push(...parsed.warnings);
    return {
      workbook: {
        ...emptyWorkbook(),
        auxiliarMovimientos: parsed.movimientos,
        auxiliarResumen: parsed.resumen,
      },
      warnings,
    };
  }

  if (input.documentType === "diarios_polizas") {
    // El impreso de pólizas es auto-contenido: el parser lee los bloques
    // directamente del buffer (librería xlsx) y no necesita columnMap.
    const parsed = parseContpaqPolizas(input.buffer, {
      filename: input.filename,
      periodo: input.periodo,
      anio: input.anio,
    });
    warnings.push(...parsed.warnings);
    if (parsed.polizas.length === 0) {
      warnings.push({
        rule: "PARSEO",
        severity: "ERROR",
        message: "El impreso de pólizas no produjo ninguna póliza.",
      });
    }
    return {
      workbook: {
        ...emptyWorkbook(),
        polizas: parsed.polizas,
        polizaMovimientos: parsed.movimientos,
      },
      warnings,
    };
  }

  if (input.documentType !== "balanza" || !input.profile) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `El documento (${input.documentType}) no se persiste en v1.`,
    });
    return { workbook: emptyWorkbook(), warnings };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);
  const needle = (input.profile.sheetMatch ?? "").toLowerCase();
  const worksheet =
    workbook.worksheets.find((sheet) =>
      sheet.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(needle),
    ) ?? workbook.worksheets[0];
  if (!worksheet) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "No se encontró una hoja para mapear la balanza.",
    });
    return { workbook: emptyWorkbook(), warnings };
  }

  const balanza = parseBalanzaSheet(worksheet, input.profile, input.periodo, input.anio);
  if (balanza.length === 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "ERROR",
      message: "La balanza no produjo filas numéricas.",
    });
  }
  warnings.push({
    rule: "PARSEO",
    severity: "WARNING",
    message: "No hay tesorería canónica en este paquete. El tablero de flujo mostrará N/D.",
    sheet: worksheet.name,
  });
  warnings.push({
    rule: "PARSEO",
    severity: "WARNING",
    message: "Sin auxiliar de clientes/proveedores: cobranza y CxP quedan N/D.",
  });
  if (!balanza.some((row) => Math.abs(row.montoPresupuestado) > 0.01)) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: "Sin presupuesto oficial (monto_presupuestado=0).",
    });
  }

  return { workbook: { ...emptyWorkbook(), balanza }, warnings };
}

export function profileFromRecord(row: {
  id: string;
  tenantId: string | null;
  origin: string;
  profileKey: string;
  version: number;
  isActive: boolean;
  fingerprintHash: string;
  name: string;
  sourceSystem: string;
  documentType: string;
  headerRow: number;
  sheetMatch: string | null;
  columnMap: unknown;
  enumMap: unknown;
  accountPrefixRules: unknown;
  accountRoles: unknown;
  matcherConfig: unknown;
  flujoConfig: unknown;
  partidaDobleMode: string;
  bridgeTesoreriaFromBalanza: boolean;
}): MappingProfileShape {
  return {
    id: row.id,
    tenantId: row.tenantId,
    origin: row.origin as MappingProfileShape["origin"],
    profileKey: row.profileKey,
    version: row.version,
    isActive: row.isActive,
    fingerprintHash: row.fingerprintHash,
    name: row.name,
    sourceSystem: row.sourceSystem as MappingProfileShape["sourceSystem"],
    documentType: row.documentType as MappingProfileShape["documentType"],
    headerRow: row.headerRow,
    sheetMatch: row.sheetMatch,
    columnMap: (row.columnMap ?? {}) as MappingProfileShape["columnMap"],
    enumMap: (row.enumMap ?? {}) as MappingProfileShape["enumMap"],
    accountPrefixRules: (row.accountPrefixRules ?? null) as MappingProfileShape["accountPrefixRules"],
    accountRoles: (row.accountRoles ?? null) as MappingProfileShape["accountRoles"],
    matcherConfig: row.matcherConfig as MappingProfileShape["matcherConfig"],
    flujoConfig: (row.flujoConfig ?? null) as MappingProfileShape["flujoConfig"],
    partidaDobleMode: row.partidaDobleMode as MappingProfileShape["partidaDobleMode"],
    bridgeTesoreriaFromBalanza: row.bridgeTesoreriaFromBalanza,
  };
}
