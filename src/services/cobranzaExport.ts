import { type AntiguedadBucketKey, type AntiguedadTerceroRow } from "@/services/antiguedad";
import { type CobranzaClienteRow } from "@/services/cobranzaTransformer";
import type { ConcentracionRow, RiesgoClasificacion } from "@/services/concentracionRiesgo";
import { slugAscii, type ColumnMode, type TableRow } from "@/services/tableExport";

export function cobranzaExportTable(
  clientes: CobranzaClienteRow[],
  columnMode: ColumnMode,
): { headers: string[]; rows: TableRow[] } {
  if (columnMode === "sistemas") {
    return {
      headers: ["cliente_id", "cliente_nombre", "saldo", "dias", "bucket"],
      rows: clientes.map((row) => [slugAscii(row.cliente), row.cliente, row.saldo, row.dias, row.bucket]),
    };
  }

  return {
    headers: ["Cliente", "Saldo", "Días", "Bucket"],
    rows: clientes.map((row) => [row.cliente, row.saldo, row.dias, row.bucket]),
  };
}

export function cobranzaExportFilename(empresa: string, asOf: string, kind: "xlsx" | "csv"): string {
  return `${slugAscii(empresa)}-cobranza-${asOf}.${kind}`;
}

export function antiguedadExportTable(
  terceros: AntiguedadTerceroRow[],
  columnMode: ColumnMode,
  bucketLabel: (key: AntiguedadBucketKey) => string,
): { headers: string[]; rows: TableRow[] } {
  if (columnMode === "sistemas") {
    return {
      headers: ["tercero_id", "tercero_nombre", "saldo", "dias_vencidos", "bucket"],
      rows: terceros.map((row) => [slugAscii(row.tercero), row.tercero, row.saldo, row.diasVencidos, row.bucket]),
    };
  }

  return {
    headers: ["Tercero", "Saldo", "Días vencidos", "Bucket"],
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
    headers: ["Razón Social", "Monto", "% Individual", "% Acumulado", "Plazo Medio (días)", "Clasificación"],
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
