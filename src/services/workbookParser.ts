import { AppError } from "@/auth/errors";
import {
  CategoriaMaestra,
  ClasificacionGasto,
  EstatusPago,
  TipoInversion,
} from "@/generated/prisma/enums";
import type {
  BalanzaRow,
  EgresoRow,
  MasterWorkbook,
  TesoreriaRow,
  VentaRow,
} from "@/services/ingestionTypes";
import { toNumber } from "@/services/money";
import ExcelJS from "exceljs";

const REQUIRED_SHEETS = [
  "balanza_pnl",
  "auxiliar_ventas",
  "auxiliar_egresos",
  "tesoreria_flujo",
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function cellString(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "object" && "text" in (value as { text?: string }) && (value as { text?: string }).text) {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return cellString((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function cellNumber(value: unknown, sheet: string, row: number, column: string): number {
  if (value == null || value === "") {
    throw new AppError("VALIDATION_ERROR", `Falta el valor numérico ${column}.`, 400, {
      sheet,
      row,
    });
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return cellNumber((value as { result: unknown }).result, sheet, row, column);
  }
  const n = toNumber(value as string | number);
  if (!Number.isFinite(n)) {
    throw new AppError("VALIDATION_ERROR", `El valor de ${column} no es numérico.`, 400, {
      sheet,
      row,
    });
  }
  return n;
}

function cellBoolean(value: unknown): boolean {
  const raw = cellString(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "si" || raw === "sí" || raw === "yes";
}

function excelDateToJs(value: unknown, sheet: string, row: number, column: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number") {
    // Serial de Excel: día 0 = 1899-12-30.
    const utc = Date.UTC(1899, 11, 30) + value * 86400000;
    const js = new Date(utc);
    if (!Number.isNaN(js.getTime())) {
      return new Date(js.getUTCFullYear(), js.getUTCMonth(), js.getUTCDate());
    }
  }
  const asString = cellString(value);
  const fromIso = new Date(asString);
  if (!Number.isNaN(fromIso.getTime())) {
    return fromIso;
  }
  throw new AppError("VALIDATION_ERROR", `La fecha de ${column} no es válida.`, 400, { sheet, row });
}

function getCellAny(
  row: ExcelJS.Row,
  headers: HeaderMap,
  columns: string[],
  sheet: string,
  rowNumber: number,
): unknown {
  for (const column of columns) {
    const index = headers.get(column);
    if (index) {
      return row.getCell(index).value;
    }
  }
  throw new AppError(
    "VALIDATION_ERROR",
    `La hoja ${sheet} no tiene la columna ${columns[0]}.`,
    400,
    { sheet, row: rowNumber },
  );
}

function requireEnum<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
  sheet: string,
  row: number,
  column: string,
): T[keyof T] {
  const raw = cellString(value);
  const allowed = Object.values(enumObject);
  if (!allowed.includes(raw)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Valor inválido en ${column}: "${raw}". Permitidos: ${allowed.join(", ")}.`,
      400,
      { sheet, row },
    );
  }
  return raw as T[keyof T];
}

function requireText(value: unknown, sheet: string, row: number, column: string): string {
  const text = cellString(value);
  if (!text) {
    throw new AppError("VALIDATION_ERROR", `Falta ${column}.`, 400, { sheet, row });
  }
  return text;
}

type HeaderMap = Map<string, number>;

function readHeaderMap(worksheet: ExcelJS.Worksheet): HeaderMap {
  const header = worksheet.getRow(1);
  const map: HeaderMap = new Map();
  header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeHeader(cell.value);
    if (key) {
      map.set(key, colNumber);
    }
  });
  return map;
}

function getCell(
  row: ExcelJS.Row,
  headers: HeaderMap,
  column: string,
  sheet: string,
  rowNumber: number,
): unknown {
  const index = headers.get(column);
  if (!index) {
    throw new AppError(
      "VALIDATION_ERROR",
      `La hoja ${sheet} no tiene la columna ${column}.`,
      400,
      { sheet, row: rowNumber },
    );
  }
  return row.getCell(index).value;
}

function isRowEmpty(row: ExcelJS.Row, headers: HeaderMap): boolean {
  for (const col of headers.values()) {
    const value = row.getCell(col).value;
    if (value != null && cellString(value) !== "") {
      return false;
    }
  }
  return true;
}

function parseBalanza(worksheet: ExcelJS.Worksheet): BalanzaRow[] {
  const sheet = "balanza_pnl";
  const headers = readHeaderMap(worksheet);
  const rows: BalanzaRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || isRowEmpty(row, headers)) {
      return;
    }
    const cell = (column: string) => getCell(row, headers, column, sheet, rowNumber);
    rows.push({
      row: rowNumber,
      idCuenta: requireText(cell("id_cuenta"), sheet, rowNumber, "id_cuenta"),
      nombreCuenta: requireText(cell("nombre_cuenta"), sheet, rowNumber, "nombre_cuenta"),
      categoriaMaestra: requireEnum(cell("categoria_maestra"), CategoriaMaestra, sheet, rowNumber, "categoria_maestra"),
      saldoInicial: cellNumber(cell("saldo_inicial"), sheet, rowNumber, "saldo_inicial"),
      debe: cellNumber(cell("debe"), sheet, rowNumber, "debe"),
      haber: cellNumber(cell("haber"), sheet, rowNumber, "haber"),
      saldoFinal: cellNumber(cell("saldo_final"), sheet, rowNumber, "saldo_final"),
      montoPresupuestado: cellNumber(cell("monto_presupuestado"), sheet, rowNumber, "monto_presupuestado"),
      depreciacionAmortizacion: cellBoolean(cell("depreciacion_amortizacion")),
      periodo: Math.trunc(cellNumber(cell("periodo"), sheet, rowNumber, "periodo")),
      anio: Math.trunc(
        cellNumber(getCellAny(row, headers, ["anio", "ano"], sheet, rowNumber), sheet, rowNumber, "anio"),
      ),
    });
  });

  return rows;
}

function parseVentas(worksheet: ExcelJS.Worksheet): VentaRow[] {
  const sheet = "auxiliar_ventas";
  const headers = readHeaderMap(worksheet);
  const rows: VentaRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || isRowEmpty(row, headers)) {
      return;
    }
    const cell = (column: string) => getCell(row, headers, column, sheet, rowNumber);
    rows.push({
      row: rowNumber,
      idCliente: requireText(cell("id_cliente"), sheet, rowNumber, "id_cliente"),
      nombreCliente: requireText(cell("nombre_cliente"), sheet, rowNumber, "nombre_cliente"),
      folioFactura: requireText(cell("folio_factura"), sheet, rowNumber, "folio_factura"),
      fechaEmision: excelDateToJs(cell("fecha_emision"), sheet, rowNumber, "fecha_emision"),
      fechaVencimiento: excelDateToJs(cell("fecha_vencimiento"), sheet, rowNumber, "fecha_vencimiento"),
      montoSubtotal: cellNumber(cell("monto_subtotal"), sheet, rowNumber, "monto_subtotal"),
      iva: cellNumber(cell("iva"), sheet, rowNumber, "iva"),
      montoCobrado: cellNumber(cell("monto_cobrado"), sheet, rowNumber, "monto_cobrado"),
      estatusPago: requireEnum(cell("estatus_pago"), EstatusPago, sheet, rowNumber, "estatus_pago"),
      lineaNegocio: requireText(cell("linea_negocio"), sheet, rowNumber, "linea_negocio"),
    });
  });

  return rows;
}

function parseEgresos(worksheet: ExcelJS.Worksheet): EgresoRow[] {
  const sheet = "auxiliar_egresos";
  const headers = readHeaderMap(worksheet);
  const rows: EgresoRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || isRowEmpty(row, headers)) {
      return;
    }
    const cell = (column: string) => getCell(row, headers, column, sheet, rowNumber);
    rows.push({
      row: rowNumber,
      idProveedor: requireText(cell("id_proveedor"), sheet, rowNumber, "id_proveedor"),
      nombreProveedor: requireText(cell("nombre_proveedor"), sheet, rowNumber, "nombre_proveedor"),
      folioDocumento: requireText(cell("folio_documento"), sheet, rowNumber, "folio_documento"),
      fechaEmision: excelDateToJs(cell("fecha_emision"), sheet, rowNumber, "fecha_emision"),
      fechaVencimiento: excelDateToJs(cell("fecha_vencimiento"), sheet, rowNumber, "fecha_vencimiento"),
      montoSubtotal: cellNumber(cell("monto_subtotal"), sheet, rowNumber, "monto_subtotal"),
      centroDeCostos: requireText(cell("centro_de_costos"), sheet, rowNumber, "centro_de_costos"),
      clasificacionGasto: requireEnum(
        cell("clasificacion_gasto"),
        ClasificacionGasto,
        sheet,
        rowNumber,
        "clasificacion_gasto",
      ),
      tipoInversion: requireEnum(cell("tipo_inversion"), TipoInversion, sheet, rowNumber, "tipo_inversion"),
      estatusPago: requireEnum(cell("estatus_pago"), EstatusPago, sheet, rowNumber, "estatus_pago"),
    });
  });

  return rows;
}

function parseTesoreria(worksheet: ExcelJS.Worksheet): TesoreriaRow[] {
  const sheet = "tesoreria_flujo";
  const headers = readHeaderMap(worksheet);
  const rows: TesoreriaRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || isRowEmpty(row, headers)) {
      return;
    }
    const cell = (column: string) => getCell(row, headers, column, sheet, rowNumber);
    rows.push({
      row: rowNumber,
      idBancoCaja: requireText(cell("id_banco_caja"), sheet, rowNumber, "id_banco_caja"),
      saldoInicialPeriodo: cellNumber(cell("saldo_inicial_periodo"), sheet, rowNumber, "saldo_inicial_periodo"),
      entradasOperativas: cellNumber(cell("entradas_operativas"), sheet, rowNumber, "entradas_operativas"),
      salidasOperativas: cellNumber(cell("salidas_operativas"), sheet, rowNumber, "salidas_operativas"),
      salidasCapex: cellNumber(cell("salidas_capex"), sheet, rowNumber, "salidas_capex"),
      servicioDeuda: cellNumber(cell("servicio_deuda"), sheet, rowNumber, "servicio_deuda"),
      saldoFinalPeriodo: cellNumber(cell("saldo_final_periodo"), sheet, rowNumber, "saldo_final_periodo"),
      periodo: Math.trunc(cellNumber(cell("periodo"), sheet, rowNumber, "periodo")),
      anio: Math.trunc(
        cellNumber(getCellAny(row, headers, ["anio", "ano"], sheet, rowNumber), sheet, rowNumber, "anio"),
      ),
    });
  });

  return rows;
}

export async function parseMasterWorkbook(buffer: Buffer, filename: string): Promise<MasterWorkbook> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm"))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La plantilla máster debe ser un Excel (.xlsx) con las 4 pestañas. Un CSV suelto no es válido.",
      400,
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const names = workbook.worksheets.map((sheet) => sheet.name.trim());
  for (const required of REQUIRED_SHEETS) {
    if (!names.includes(required)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Falta la pestaña "${required}". Se requieren: ${REQUIRED_SHEETS.join(", ")}.`,
        400,
      );
    }
  }

  return {
    balanza: parseBalanza(workbook.getWorksheet("balanza_pnl")!),
    ventas: parseVentas(workbook.getWorksheet("auxiliar_ventas")!),
    egresos: parseEgresos(workbook.getWorksheet("auxiliar_egresos")!),
    tesoreria: parseTesoreria(workbook.getWorksheet("tesoreria_flujo")!),
    tesoreriaDetalle: [],
    auxiliarMovimientos: [],
    auxiliarResumen: [],
    polizas: [],
    polizaMovimientos: [],
  };
}
