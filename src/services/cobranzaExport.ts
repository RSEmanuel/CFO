import { type AntiguedadBucketKey, type AntiguedadTerceroRow } from "@/services/antiguedad";
import { type CobranzaClienteRow } from "@/services/cobranzaTransformer";
import type { ConcentracionRow, RiesgoClasificacion } from "@/services/concentracionRiesgo";
import { slugAscii, type ColumnMode, type TableRow } from "@/services/tableExport";

type Translate = (key: string) => string;

/** Encabezados del modo lectura; con `t` salen del idioma activo (`cobranza.export.*`). */
const ENCABEZADO_ES: Record<string, string> = {
  cliente: "Cliente",
  saldo: "Saldo",
  diasVencidos: "Días vencidos",
  rango: "Rango",
  vencido: "Vencido",
  queHacer: "Qué hacer",
  teDebe: "Te debe",
  diasSinCobrar: "Días sin cobrar (estimado)",
  tercero: "Tercero",
  bucket: "Bucket",
  razonSocial: "Razón Social",
  monto: "Monto",
  pctIndividual: "% Individual",
  pctAcumulado: "% Acumulado",
  plazoMedio: "Plazo Medio (días)",
  clasificacion: "Clasificación",
};

function encabezados(t: Translate | undefined, keys: string[]): string[] {
  return keys.map((key) => {
    const fallback = ENCABEZADO_ES[key] ?? key;
    if (!t) return fallback;
    const fullKey = `cobranza.export.${key}`;
    const value = t(fullKey);
    return value && value !== fullKey ? value : fallback;
  });
}

export function cobranzaExportTable(
  clientes: CobranzaClienteRow[],
  columnMode: ColumnMode,
  bucketLabel: (key: AntiguedadBucketKey) => string,
  t?: Translate,
): { headers: string[]; rows: TableRow[] } {
  if (columnMode === "sistemas") {
    return {
      headers: ["cliente_id", "cliente_nombre", "saldo", "dias_vencidos", "bucket"],
      rows: clientes.map((row) => [slugAscii(row.cliente), row.cliente, row.saldo, row.dias, row.bucket]),
    };
  }

  return {
    headers: encabezados(t, ["cliente", "saldo", "diasVencidos", "rango"]),
    rows: clientes.map((row) => [row.cliente, row.saldo, row.dias, bucketLabel(row.bucket)]),
  };
}

export type ListaClientesRow = {
  cliente: string;
  monto: number;
  dias: number;
  accion: string;
  alMenos?: boolean;
};

/** "vencido": con fecha de vencimiento. "sinCobrar": solo días desde la factura (estimado, sin plazo). */
export function listaClientesExportTable(
  rows: ListaClientesRow[],
  variant: "vencido" | "sinCobrar",
  columnMode: ColumnMode,
  accionLabel: (accion: string) => string,
  t?: Translate,
): { headers: string[]; rows: TableRow[] } {
  const vencido = variant === "vencido";
  if (columnMode === "sistemas") {
    return {
      headers: ["cliente_id", "cliente_nombre", vencido ? "vencido" : "saldo", vencido ? "dias_vencidos" : "dias_sin_cobrar", "dias_es_minimo", "accion"],
      rows: rows.map((row) => [slugAscii(row.cliente), row.cliente, row.monto, row.dias, row.alMenos ? 1 : 0, row.accion]),
    };
  }

  return {
    headers: vencido
      ? encabezados(t, ["cliente", "vencido", "diasVencidos", "queHacer"])
      : encabezados(t, ["cliente", "teDebe", "diasSinCobrar", "queHacer"]),
    rows: rows.map((row) => [
      row.cliente,
      row.monto,
      row.alMenos ? `${row.dias}+` : row.dias,
      accionLabel(row.accion),
    ]),
  };
}

export function listaClientesExportFilename(
  empresa: string,
  asOf: string,
  variant: "vencido" | "sinCobrar",
  kind: "xlsx" | "csv",
): string {
  const nombre = variant === "vencido" ? "clientes-que-no-pagan" : "clientes-sin-cobrar";
  return `${slugAscii(empresa)}-${nombre}-${asOf}.${kind}`;
}

export function cobranzaExportFilename(empresa: string, asOf: string, kind: "xlsx" | "csv"): string {
  return `${slugAscii(empresa)}-cobranza-${asOf}.${kind}`;
}

export function antiguedadExportTable(
  terceros: AntiguedadTerceroRow[],
  columnMode: ColumnMode,
  bucketLabel: (key: AntiguedadBucketKey) => string,
  t?: Translate,
): { headers: string[]; rows: TableRow[] } {
  if (columnMode === "sistemas") {
    return {
      headers: ["tercero_id", "tercero_nombre", "saldo", "dias_vencidos", "bucket"],
      rows: terceros.map((row) => [slugAscii(row.tercero), row.tercero, row.saldo, row.diasVencidos, row.bucket]),
    };
  }

  return {
    headers: encabezados(t, ["tercero", "saldo", "diasVencidos", "bucket"]),
    rows: terceros.map((row) => [row.tercero, row.saldo, row.diasVencidos, bucketLabel(row.bucket)]),
  };
}

export function antiguedadExportFilename(
  empresa: string,
  asOf: string,
  lado: "cxc" | "cxp",
  kind: "xlsx" | "csv",
): string {
  return `${slugAscii(empresa)}-antiguedad-${lado}-${asOf}.${kind}`;
}

export function concentracionExportTable(
  rows: ConcentracionRow[],
  columnMode: ColumnMode,
  riesgoLabel: (key: RiesgoClasificacion) => string,
  t?: Translate,
): { headers: string[]; rows: TableRow[] } {
  if (columnMode === "sistemas") {
    return {
      headers: [
        "cuenta_id",
        "razon_social",
        "monto",
        "base_monto",
        "pct_individual",
        "pct_acumulado",
        "plazo_medio_dias",
        "clasificacion",
      ],
      rows: rows.map((row) => [
        row.accountId,
        row.entityName,
        row.monto,
        row.baseMonto,
        row.pctIndividual,
        row.pctAcumulado,
        row.plazoMedioDias,
        row.clasificacion,
      ]),
    };
  }

  return {
    headers: encabezados(t, ["razonSocial", "monto", "pctIndividual", "pctAcumulado", "plazoMedio", "clasificacion"]),
    rows: rows.map((row) => [
      row.entityName,
      row.monto,
      row.pctIndividual,
      row.pctAcumulado,
      row.plazoMedioDias,
      riesgoLabel(row.clasificacion),
    ]),
  };
}

export function concentracionExportFilename(
  empresa: string,
  asOf: string,
  tipo: "clientes" | "proveedores",
  moneda: string,
  kind: "xlsx" | "csv",
): string {
  return `${slugAscii(empresa)}-concentracion-${tipo}-${moneda.toLowerCase()}-${asOf}.${kind}`;
}
