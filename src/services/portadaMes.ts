import type { ClientesSinCobrarModel } from "@/services/carteraSinCobrar";
import { clienteParaRevisar } from "@/services/carteraSinCobrar";
import { clienteParaSuspender, type ClientesQueNoPaganModel } from "@/services/clientesQueNoPagan";
import type { ErRow, ErRowKey } from "@/services/estadoOperativo";
import { MESES_RESPIRO_MINIMO } from "@/services/flujoTransformer";
import { round2 } from "@/services/money";
import type { PanelSaldos } from "@/services/panelSaldos";

/**
 * Portada del Panel de Control (B05, rediseño 2026-11). Responde en orden: ¿vendí
 * y gané? (ventas y utilidad del PyG oficial, computeErBuckets), ¿tengo dinero?
 * (tu caja y meses de respiro de services/caja.ts) y ¿qué me deben y qué debo?
 * (saldos de services/panelSaldos.ts: CxC, CxP, deuda e impuestos). Junta cifras
 * que ya existen con una sola definición cada una; no recalcula nada propio.
 */

export type PortadaSello = "confirmed" | "estimated" | "missing";

export type PortadaInput = {
  estado: { filas: ErRow[]; hasBalanza: boolean } | null;
  caja: { hasBalanza: boolean; caja: number; cuentas: number; mesesDeRespiro: number | null } | null;
  cobranza: {
    clientesQueNoPagan: ClientesQueNoPaganModel | null;
    clientesSinCobrar: ClientesSinCobrarModel | null;
  } | null;
  /** Saldos al cierre del mes (CxC, CxP, deuda, impuestos). */
  saldos?: PanelSaldos | null;
  /** Ventas del mismo mes del año anterior (serie de resultados, mismo PyG oficial). */
  ventasAnioAnterior?: number | null;
  /** EBITDA de los últimos 12 meses y cuántos meses lo respaldan (se anualiza si son menos). */
  ebitda12m?: { monto: number; meses: number } | null;
};

export type PortadaAlerta =
  | { kind: "lowRunway"; caja: number; meses: number }
  | { kind: "clienteSuspender"; cliente: string; monto: number; dias: number }
  | { kind: "clienteRevisar"; cliente: string; monto: number; dias: number }
  | { kind: "perdida"; monto: number }
  | { kind: "gastoSube"; pct: number; monto: number }
  | { kind: "deudaAlta"; anios: number }
  | { kind: "deudaSinOperacion"; monto: number };

/** Con qué se paga la deuda: años de operación (deuda neta ÷ EBITDA anual). */
export type PortadaDeuda =
  | { estado: "anios"; anios: number }
  | { estado: "cajaCubre" }
  | { estado: "sinOperacion" }
  | { estado: "sinDato" };

export type PortadaMes = {
  ventas: number | null;
  ventasAnterior: number | null;
  ventasAnioAnterior: number | null;
  /** Utilidad ÷ ventas × 100. */
  margenPct: number | null;
  cxc: number | null;
  dso: number | null;
  cxp: number | null;
  dpo: number | null;
  deuda: number | null;
  deudaPago: PortadaDeuda;
  impuestos: { total: number; ivaPorCobrar: number } | null;
  utilidad: number | null;
  utilidadAnterior: number | null;
  /** null si la balanza no trae cuentas de caja: no hay caja que mostrar, no es $0. */
  caja: number | null;
  mesesDeRespiro: number | null;
  clientes: { monto: number; base: "vencido" | "sinCobrar" } | null;
  /** Costo + gastos de operación del mes contra el mes anterior (PyG oficial). */
  gasto: { actual: number; anterior: number | null; variacionPct: number | null } | null;
  alertas: PortadaAlerta[];
};

/** Subida de costos y gastos que ya amerita alerta. */
export const GASTO_SUBE_MINIMO_PCT = 10;
/** Deuda neta mayor a 3 años de EBITDA: el umbral que suelen usar los bancos para no prestar más. */
export const DEUDA_ANIOS_ALERTA = 3;
export const MAX_ALERTAS = 3;

function monto(filas: ErRow[], key: ErRowKey, mes: "mesActual" | "mesAnterior"): number | null {
  return filas.find((fila) => fila.key === key)?.[mes].monto ?? null;
}

function suma(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : round2(a + b);
}

export function buildPortadaMes(input: PortadaInput): PortadaMes {
  const filas = input.estado?.hasBalanza ? input.estado.filas : [];
  const ventas = monto(filas, "ventas", "mesActual");
  const ventasAnterior = monto(filas, "ventas", "mesAnterior");
  const utilidad = monto(filas, "utilidadNeta", "mesActual");
  const utilidadAnterior = monto(filas, "utilidadNeta", "mesAnterior");

  const gastoActual = suma(monto(filas, "costo", "mesActual"), monto(filas, "totalOpex", "mesActual"));
  const gastoAnterior = suma(monto(filas, "costo", "mesAnterior"), monto(filas, "totalOpex", "mesAnterior"));
  const gasto =
    gastoActual == null
      ? null
      : {
          actual: gastoActual,
          anterior: gastoAnterior,
          variacionPct:
            gastoAnterior != null && gastoAnterior > 0.01
              ? round2(((gastoActual - gastoAnterior) / gastoAnterior) * 100)
              : null,
        };

  const cajaOk = input.caja?.hasBalanza && input.caja.cuentas > 0 ? input.caja : null;
  const caja = cajaOk ? round2(cajaOk.caja) : null;
  const mesesDeRespiro = cajaOk?.mesesDeRespiro ?? null;

  const cobranza = input.cobranza;
  const vencido = cobranza?.clientesQueNoPagan ?? null;
  const sinCobrar = cobranza?.clientesSinCobrar ?? null;
  const clientes = vencido
    ? { monto: vencido.totalVencido, base: "vencido" as const }
    : sinCobrar
      ? { monto: sinCobrar.totalSaldo, base: "sinCobrar" as const }
      : null;

  const saldos = input.saldos?.hasBalanza ? input.saldos : null;
  const margenPct = ventas != null && utilidad != null && ventas > 0.01 ? round2((utilidad / ventas) * 100) : null;
  const ebitdaAnual =
    input.ebitda12m && input.ebitda12m.meses > 0 ? round2((input.ebitda12m.monto * 12) / input.ebitda12m.meses) : null;
  const deudaPago: PortadaDeuda =
    saldos?.deuda == null || saldos.deudaNeta == null
      ? { estado: "sinDato" }
      : saldos.deudaNeta <= 0.01
        ? { estado: "cajaCubre" }
        : ebitdaAnual == null
          ? { estado: "sinDato" }
          : ebitdaAnual <= 0.01
            ? { estado: "sinOperacion" }
            : { estado: "anios", anios: round2(saldos.deudaNeta / ebitdaAnual) };

  const alertas: PortadaAlerta[] = [];
  if (caja != null && mesesDeRespiro != null && mesesDeRespiro < MESES_RESPIRO_MINIMO) {
    alertas.push({ kind: "lowRunway", caja, meses: mesesDeRespiro });
  }
  const aSuspender = vencido ? clienteParaSuspender(vencido) : null;
  const aRevisar = !vencido && sinCobrar ? clienteParaRevisar(sinCobrar) : null;
  if (aSuspender) {
    alertas.push({
      kind: "clienteSuspender",
      cliente: aSuspender.cliente,
      monto: aSuspender.vencido,
      dias: aSuspender.diasVencidos,
    });
  } else if (aRevisar) {
    alertas.push({ kind: "clienteRevisar", cliente: aRevisar.cliente, monto: aRevisar.saldo, dias: aRevisar.diasSinCobrar });
  }
  if (utilidad != null && utilidad < -0.01) {
    alertas.push({ kind: "perdida", monto: round2(-utilidad) });
  }
  if (deudaPago.estado === "anios" && deudaPago.anios > DEUDA_ANIOS_ALERTA) {
    alertas.push({ kind: "deudaAlta", anios: deudaPago.anios });
  } else if (deudaPago.estado === "sinOperacion" && saldos?.deuda != null) {
    alertas.push({ kind: "deudaSinOperacion", monto: saldos.deuda });
  }
  if (gasto && gasto.anterior != null && gasto.variacionPct != null && gasto.variacionPct >= GASTO_SUBE_MINIMO_PCT) {
    alertas.push({ kind: "gastoSube", pct: gasto.variacionPct, monto: round2(gasto.actual - gasto.anterior) });
  }

  return {
    ventas,
    ventasAnterior,
    ventasAnioAnterior: input.ventasAnioAnterior ?? null,
    margenPct,
    cxc: saldos?.cxc ?? null,
    dso: saldos?.dso ?? null,
    cxp: saldos?.cxp ?? null,
    dpo: saldos?.dpo ?? null,
    deuda: saldos?.deuda ?? null,
    deudaPago,
    impuestos: saldos?.impuestos ?? null,
    utilidad,
    utilidadAnterior,
    caja,
    mesesDeRespiro,
    clientes,
    gasto,
    alertas: alertas.slice(0, MAX_ALERTAS),
  };
}
