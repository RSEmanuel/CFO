import * as XLSX from "xlsx";
import { round2 } from "@/services/money";
import type {
  AuxiliarCuentaResumenRow,
  AuxiliarMovimientoRow,
  QualityIssue,
} from "@/services/ingestionTypes";

/**
 * Parser del reporte CONTPAQi "Movimientos, Auxiliares del Catálogo" orientado
 * a cartera: solo conserva las subcuentas hoja de CLIENTES y PROVEEDORES para
 * alimentar los módulos de Cobranza y Cuentas por Pagar.
 *
 * Estructura del reporte (una sección por cuenta/subcuenta):
 *   - Apertura:  [cuenta] [nombre] ... "Saldo inicial :" [monto]
 *   - Movimientos: [fecha] [tipo] [número] [concepto] [referencia] [cargos] [abonos] [saldo]
 *   - Cierre:    ... "Total:" [cargos] [abonos] [saldo final]
 *
 * Soporta catálogos con código corto (105-01-042) y largo (1105-0001-0001-0000).
 */

export interface CarteraItem {
  accountId: string;
  accountNumber: string;
  entityName: string;
  type: "CLIENTE" | "PROVEEDOR";
  saldoInicial: number;
  /** Clientes: cargos (facturado). Proveedores: abonos (comprado a crédito). */
  facturadoOCompradoEnMes: number;
  /** Clientes: abonos (cobranza). Proveedores: cargos (pagos). */
  pagadoEnMes: number;
  saldoPendiente: number;
  movimientosCount: number;
}

export interface CarteraSummary {
  moneda: string;
  periodo: number;
  anio: number;
  totalCxCPendientes: number;
  totalCobradoEnMes: number;
  totalCxPPendientes: number;
  totalPagadoProveedoresEnMes: number;
  clientesCount: number;
  proveedoresCount: number;
}

export interface ContpaqAuxiliaresParseResult {
  items: CarteraItem[];
  /** Movimientos individuales de las cuentas de cartera, listos para AuxiliarMovimiento. */
  movimientos: AuxiliarMovimientoRow[];
  /** Saldos agregados por cuenta de cartera, listos para AuxiliarCuentaResumen. */
  resumen: AuxiliarCuentaResumenRow[];
  summary: CarteraSummary | null;
  moneda: string;
  periodo: number | null;
  anio: number | null;
  warnings: QualityIssue[];
}

export interface ContpaqAuxiliaresParseOptions {
  filename?: string;
  /** Fallback cuando el encabezado del reporte no trae rango de fechas. */
  periodo?: number;
  anio?: number;
  /** Primeros segmentos de cuenta tratados como clientes. Default: catálogo genérico + Compac. */
  clientePrefixes?: string[];
  proveedorPrefixes?: string[];
  sheetName?: string;
}

const DEFAULT_CLIENTE_PREFIXES = ["105", "1105"];
const DEFAULT_PROVEEDOR_PREFIXES = ["201", "2101"];

/** Código de cuenta CONTPAQi: 105-01-042, 1105-0001-0001-0000, etc. */
const ACCOUNT_RE = /^\d{2,4}(-\d{2,5})+$/;
const DATE_TEXT_RE = /^(\d{1,2})[/\-.]([A-Za-z]{3,}|\d{1,2})[/\-.](\d{4})$/;
const PERIOD_RANGE_RE = /del\s+(\d{1,2}\/[A-Za-z]{3,}\/\d{4})\s+al\s+(\d{1,2}\/[A-Za-z]{3,}\/\d{4})/i;

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

type AccountBlock = {
  row: number;
  accountNumber: string;
  entityName: string;
  type: "CLIENTE" | "PROVEEDOR";
  saldoInicial: number;
  sumCargos: number;
  sumAbonos: number;
  movimientosCount: number;
  totalRow: { cargos: number; abonos: number; saldoFinal: number } | null;
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

/** "105-01-042" → "105"; "1105-0001-0001-0000" → "1105". */
function firstSegment(accountNumber: string): string {
  return accountNumber.split("-")[0] ?? accountNumber;
}

/** Cuenta de mayor/encabezado: todos los segmentos tras el primero son cero. */
function isMayorAccount(accountNumber: string): boolean {
  return accountNumber
    .split("-")
    .slice(1)
    .every((segment) => /^0+$/.test(segment));
}

/**
 * Clasificación estricta por prefijo: el fallback por nombre sacaba cuentas que
 * no son cartera ("IVA RETENIDO POR CLIENTES" 1108, "Anticipo de cliente" 2306).
 * Catálogos con otros códigos pueden pasar clientePrefixes/proveedorPrefixes.
 */
function classifyAccount(
  accountNumber: string,
  clientePrefixes: string[],
  proveedorPrefixes: string[],
): "CLIENTE" | "PROVEEDOR" | null {
  const segment = firstSegment(accountNumber);
  if (clientePrefixes.some((prefix) => segment === prefix || segment.startsWith(prefix))) {
    return "CLIENTE";
  }
  if (proveedorPrefixes.some((prefix) => segment === prefix || segment.startsWith(prefix))) {
    return "PROVEEDOR";
  }
  return null;
}

function detectMoneda(rows: GridRow[], filename: string): { moneda: string; known: boolean } {
  for (const row of rows.slice(0, 8)) {
    const match = normalizeToken(row[0]).match(/^moneda_(.+)$/);
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

/** En la fila de apertura el monto sigue a la etiqueta "Saldo inicial :". */
function readSaldoInicial(row: GridRow): number {
  for (let col = 0; col < row.length; col += 1) {
    if (normalizeToken(row[col]).startsWith("saldo_inicial")) {
      for (let next = col + 1; next < row.length; next += 1) {
        if (row[next] != null && row[next] !== "") return round2(num(row[next]));
      }
    }
  }
  for (let col = row.length - 1; col >= 0; col -= 1) {
    if (typeof row[col] === "number") return round2(num(row[col]));
  }
  return 0;
}

/** La fila "Total:" cierra la sección: cargos, abonos y saldo final a la derecha. */
function readTotalRow(row: GridRow): { cargos: number; abonos: number; saldoFinal: number } | null {
  const labelCol = row.findIndex((cell) => normalizeToken(cell).replace(/:$/, "") === "total");
  if (labelCol < 0) return null;
  const numerics: number[] = [];
  for (let col = labelCol + 1; col < row.length; col += 1) {
    if (row[col] != null && row[col] !== "" && !Number.isNaN(num(row[col]))) {
      numerics.push(num(row[col]));
    }
  }
  if (numerics.length < 3) return null;
  return {
    cargos: round2(numerics[0]!),
    abonos: round2(numerics[1]!),
    saldoFinal: round2(numerics[numerics.length - 1]!),
  };
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

export function parseContpaqAuxiliares(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  options: ContpaqAuxiliaresParseOptions = {},
): ContpaqAuxiliaresParseResult {
  const warnings: QualityIssue[] = [];
  const filename = options.filename ?? "";
  const clientePrefixes = options.clientePrefixes ?? DEFAULT_CLIENTE_PREFIXES;
  const proveedorPrefixes = options.proveedorPrefixes ?? DEFAULT_PROVEEDOR_PREFIXES;

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
      items: [],
      movimientos: [],
      resumen: [],
      summary: null,
      moneda: "MXN",
      periodo: options.periodo ?? null,
      anio: options.anio ?? null,
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
  const { moneda, known } = detectMoneda(rows, filename);
  if (!known) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: no se detectó la moneda en el encabezado; se asumió MXN.`,
      sheet: sheetName,
    });
  }

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

  const blocks: AccountBlock[] = [];
  const movimientos: AuxiliarMovimientoRow[] = [];
  let current: AccountBlock | null = null;
  let fueraDePeriodo = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const first = text(row[0]);

    if (ACCOUNT_RE.test(first)) {
      const entityName = text(row[1]) || first;
      const type = classifyAccount(first, clientePrefixes, proveedorPrefixes);
      current =
        type && !isMayorAccount(first)
          ? {
              row: rowNumber,
              accountNumber: first,
              entityName,
              type,
              saldoInicial: readSaldoInicial(row),
              sumCargos: 0,
              sumAbonos: 0,
              movimientosCount: 0,
              totalRow: null,
            }
          : null;
      if (current) blocks.push(current);
      return;
    }

    const total = readTotalRow(row);
    if (total) {
      if (current) {
        current.totalRow = total;
        current = null;
      }
      return;
    }

    const fecha = parseFecha(row[0]);
    if (!fecha || !current) return;
    const tipoPoliza = text(row[1]);
    if (!tipoPoliza) return;

    const cargos = round2(num(row[5]));
    const abonos = round2(num(row[6]));
    current.sumCargos = round2(current.sumCargos + cargos);
    current.sumAbonos = round2(current.sumAbonos + abonos);
    current.movimientosCount += 1;
    if (periodo && anio && (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() + 1 !== periodo)) {
      fueraDePeriodo += 1;
    }
    movimientos.push({
      row: rowNumber,
      moneda,
      idCuenta: current.accountNumber,
      nombreCuenta: current.entityName,
      fecha,
      tipoPoliza,
      numeroPoliza: text(row[2]),
      concepto: text(row[3]),
      referencia: text(row[4]),
      cargos,
      abonos,
      saldo: round2(num(row[7])),
      periodo: periodo ?? 0,
      anio: anio ?? 0,
    });
  });

  const items: CarteraItem[] = [];
  const resumen: AuxiliarCuentaResumenRow[] = [];
  for (const block of blocks) {
    const cargos = block.totalRow?.cargos ?? block.sumCargos;
    const abonos = block.totalRow?.abonos ?? block.sumAbonos;
    if (block.totalRow) {
      if (Math.abs(block.totalRow.cargos - block.sumCargos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `${block.accountNumber} ${block.entityName}: la suma de cargos parseados (${block.sumCargos.toFixed(2)}) difiere del Total reportado (${block.totalRow.cargos.toFixed(2)}).`,
          sheet: sheetName,
          row: block.row,
        });
      }
      if (Math.abs(block.totalRow.abonos - block.sumAbonos) > 0.01) {
        warnings.push({
          rule: "PARSEO",
          severity: "WARNING",
          message: `${block.accountNumber} ${block.entityName}: la suma de abonos parseados (${block.sumAbonos.toFixed(2)}) difiere del Total reportado (${block.totalRow.abonos.toFixed(2)}).`,
          sheet: sheetName,
          row: block.row,
        });
      }
    }
    // Clientes: naturaleza deudora (saldo = inicial + cargos - abonos).
    // Proveedores: naturaleza acreedora (saldo = inicial - cargos + abonos).
    const saldoFallback =
      block.type === "CLIENTE"
        ? block.saldoInicial + cargos - abonos
        : block.saldoInicial - cargos + abonos;
    const saldoPendiente = round2(block.totalRow?.saldoFinal ?? saldoFallback);

    items.push({
      accountId: block.accountNumber,
      accountNumber: block.accountNumber,
      entityName: block.entityName,
      type: block.type,
      saldoInicial: round2(block.saldoInicial),
      facturadoOCompradoEnMes: block.type === "CLIENTE" ? cargos : abonos,
      pagadoEnMes: block.type === "CLIENTE" ? abonos : cargos,
      saldoPendiente,
      movimientosCount: block.movimientosCount,
    });
    resumen.push({
      moneda,
      idCuenta: block.accountNumber,
      nombreCuenta: block.entityName,
      saldoInicial: round2(block.saldoInicial),
      cargos,
      abonos,
      saldoFinal: saldoPendiente,
      periodo: periodo ?? 0,
      anio: anio ?? 0,
    });
  }

  if (fueraDePeriodo > 0) {
    warnings.push({
      rule: "PERIODO",
      severity: "WARNING",
      message: `${fueraDePeriodo} movimientos tienen fecha fuera del periodo ${periodo}/${anio} detectado.`,
      sheet: sheetName,
    });
  }
  if (items.length === 0) {
    warnings.push({
      rule: "PARSEO",
      severity: "WARNING",
      message: `${filename}: no se encontraron subcuentas de clientes (${clientePrefixes.join("/")}) ni proveedores (${proveedorPrefixes.join("/")}).`,
      sheet: sheetName,
    });
  }

  const clientes = items.filter((item) => item.type === "CLIENTE");
  const proveedores = items.filter((item) => item.type === "PROVEEDOR");
  const summary: CarteraSummary | null =
    periodo && anio
      ? {
          moneda,
          periodo,
          anio,
          totalCxCPendientes: round2(clientes.reduce((sum, item) => sum + item.saldoPendiente, 0)),
          totalCobradoEnMes: round2(clientes.reduce((sum, item) => sum + item.pagadoEnMes, 0)),
          totalCxPPendientes: round2(proveedores.reduce((sum, item) => sum + item.saldoPendiente, 0)),
          totalPagadoProveedoresEnMes: round2(
            proveedores.reduce((sum, item) => sum + item.pagadoEnMes, 0),
          ),
          clientesCount: clientes.length,
          proveedoresCount: proveedores.length,
        }
      : null;

  return { items, movimientos, resumen, summary, moneda, periodo, anio, warnings };
}

/** Subconjunto de delegates de Prisma que la persistencia necesita (testeable con mocks). */
export interface CarteraPersistenceClient {
  auxiliarMovimiento: {
    deleteMany(args: {
      where: { tenantId: string; anio: number; periodo: number; moneda: string; idCuenta: { in: string[] } };
    }): Promise<unknown>;
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
  };
  auxiliarCuentaResumen: {
    upsert(args: {
      where: {
        tenantId_anio_periodo_moneda_idCuenta: {
          tenantId: string;
          anio: number;
          periodo: number;
          moneda: string;
          idCuenta: string;
        };
      };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: CarteraPersistenceClient) => Promise<T>): Promise<T>;
}

const CREATE_MANY_CHUNK = 800;

/**
 * Persiste la cartera parseada de forma idempotente: borra los movimientos del
 * periodo SOLO de las cuentas presentes en el archivo (no toca bancos ni otros
 * auxiliares del mismo periodo) y hace upsert del saldo agregado por cuenta.
 */
export async function persistCarteraContpaq(
  client: CarteraPersistenceClient,
  tenantId: string,
  result: ContpaqAuxiliaresParseResult,
): Promise<{ movimientos: number; cuentas: number }> {
  if (!result.periodo || !result.anio) {
    throw new Error("El resultado del parser no tiene periodo/anio resueltos; no se puede persistir.");
  }
  const periodo = result.periodo;
  const anio = result.anio;
  const moneda = result.moneda;
  const accountIds = [...new Set(result.items.map((item) => item.accountNumber))];

  await client.$transaction(async (tx) => {
    if (accountIds.length > 0) {
      await tx.auxiliarMovimiento.deleteMany({
        where: { tenantId, anio, periodo, moneda, idCuenta: { in: accountIds } },
      });
    }
    const rows = result.movimientos.map((row) => ({
      tenantId,
      anio,
      periodo,
      moneda: row.moneda,
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      fecha: row.fecha,
      tipoPoliza: row.tipoPoliza,
      numeroPoliza: row.numeroPoliza,
      concepto: row.concepto,
      referencia: row.referencia,
      cargos: row.cargos,
      abonos: row.abonos,
      saldo: row.saldo,
    }));
    for (let index = 0; index < rows.length; index += CREATE_MANY_CHUNK) {
      await tx.auxiliarMovimiento.createMany({ data: rows.slice(index, index + CREATE_MANY_CHUNK) });
    }
    for (const row of result.resumen) {
      await tx.auxiliarCuentaResumen.upsert({
        where: {
          tenantId_anio_periodo_moneda_idCuenta: {
            tenantId,
            anio,
            periodo,
            moneda,
            idCuenta: row.idCuenta,
          },
        },
        create: {
          tenantId,
          anio,
          periodo,
          moneda,
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          saldoInicial: row.saldoInicial,
          cargos: row.cargos,
          abonos: row.abonos,
          saldoFinal: row.saldoFinal,
        },
        update: {
          nombreCuenta: row.nombreCuenta,
          saldoInicial: row.saldoInicial,
          cargos: row.cargos,
          abonos: row.abonos,
          saldoFinal: row.saldoFinal,
        },
      });
    }
  });

  return { movimientos: result.movimientos.length, cuentas: accountIds.length };
}
