import { daysPastDue, type AntiguedadDocumento } from "@/services/antiguedad";
import { round2 } from "@/services/money";

/**
 * "Clientes que no te pagan" (B07). Un solo criterio de antigüedad en todo
 * Cobranza: días desde la fecha de VENCIMIENTO de cada factura. Solo cuenta lo
 * vencido; lo que aún está en plazo no es un cliente que no paga.
 */

export type AccionCobranza = "recordar" | "llamar" | "exigir_fecha" | "suspender_credito";

export type ClienteQueNoPaga = {
  cliente: string;
  /** Suma de las facturas ya vencidas (sin lo que sigue en plazo). */
  vencido: number;
  /** Días de la factura vencida más antigua. */
  diasVencidos: number;
  facturasVencidas: number;
  accion: AccionCobranza;
};

export type ClientesQueNoPaganModel = {
  totalVencido: number;
  clientes: ClienteQueNoPaga[];
  /** Cuántos clientes concentran `topPct` (hasta 3). */
  topCount: number;
  /** Porcentaje del vencido que está en los `topCount` clientes más grandes. */
  topPct: number;
};

/** Mismos cortes que los rangos de Antigüedad de saldos: 30, 60 y 90 días. */
export function accionSugerida(diasVencidos: number): AccionCobranza {
  if (diasVencidos <= 30) {
    return "recordar";
  }
  if (diasVencidos <= 60) {
    return "llamar";
  }
  if (diasVencidos <= 90) {
    return "exigir_fecha";
  }
  return "suspender_credito";
}

export function buildClientesQueNoPagan(documentos: AntiguedadDocumento[], asOfIso: string): ClientesQueNoPaganModel {
  const porCliente = new Map<string, { vencido: number; diasVencidos: number; facturasVencidas: number }>();
  for (const documento of documentos) {
    const saldo = round2(documento.saldo);
    const dias = daysPastDue(documento.fechaVencimiento, asOfIso);
    if (saldo <= 0 || dias <= 0) {
      continue;
    }
    const prev = porCliente.get(documento.tercero);
    porCliente.set(documento.tercero, {
      vencido: (prev?.vencido ?? 0) + saldo,
      diasVencidos: Math.max(prev?.diasVencidos ?? 0, dias),
      facturasVencidas: (prev?.facturasVencidas ?? 0) + 1,
    });
  }

  const clientes: ClienteQueNoPaga[] = [...porCliente.entries()]
    .map(([cliente, row]) => ({
      cliente,
      vencido: round2(row.vencido),
      diasVencidos: row.diasVencidos,
      facturasVencidas: row.facturasVencidas,
      accion: accionSugerida(row.diasVencidos),
    }))
    .sort((a, b) => b.vencido - a.vencido || b.diasVencidos - a.diasVencidos);

  const totalVencido = round2(clientes.reduce((sum, row) => sum + row.vencido, 0));
  const topCount = Math.min(3, clientes.length);
  const topSum = clientes.slice(0, topCount).reduce((sum, row) => sum + row.vencido, 0);
  const topPct = totalVencido > 0.01 ? round2((topSum / totalVencido) * 100) : 0;

  return { totalVencido, clientes, topCount, topPct };
}

/** El cliente de la alerta: el de mayor monto entre los que ya piden suspender crédito. */
export function clienteParaSuspender(model: ClientesQueNoPaganModel): ClienteQueNoPaga | null {
  return model.clientes.find((row) => row.accion === "suspender_credito") ?? null;
}
