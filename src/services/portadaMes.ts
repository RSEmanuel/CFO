import type { ClientesSinCobrarModel } from "@/services/carteraSinCobrar";
import { clienteParaRevisar } from "@/services/carteraSinCobrar";
import { clienteParaSuspender, type ClientesQueNoPaganModel } from "@/services/clientesQueNoPagan";
import type { ErRow, ErRowKey } from "@/services/estadoOperativo";
import { MESES_RESPIRO_MINIMO } from "@/services/flujoTransformer";
import { round2 } from "@/services/money";

/**
 * Portada "Tu mes en 5 números" (B05). Junta cifras que ya existen con una sola
 * definición cada una: utilidad y gasto del PyG oficial (computeErBuckets), tu
 * caja y meses de respiro de services/caja.ts, y clientes de Cobranza (B07).
 * No recalcula nada con clasificaciones propias.
 */

export type PortadaSello = "confirmed" | "estimated" | "missing";

export type PortadaInput = {
  estado: { filas: ErRow[]; hasBalanza: boolean } | null;
  caja: { hasBalanza: boolean; caja: number; cuentas: number; mesesDeRespiro: number | null } | null;
  cobranza: {
    clientesQueNoPagan: ClientesQueNoPaganModel | null;
    clientesSinCobrar: ClientesSinCobrarModel | null;
  } | null;
};

export type PortadaAlerta =
  | { kind: "lowRunway"; caja: number; meses: number }
  | { kind: "clienteSuspender"; cliente: string; monto: number; dias: number }
  | { kind: "clienteRevisar"; cliente: string; monto: number; dias: number }
  | { kind: "perdida"; monto: number }
  | { kind: "gastoSube"; pct: number; monto: number };

export type PortadaMes = {
  ventas: number | null;
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
  if (gasto && gasto.anterior != null && gasto.variacionPct != null && gasto.variacionPct >= GASTO_SUBE_MINIMO_PCT) {
    alertas.push({ kind: "gastoSube", pct: gasto.variacionPct, monto: round2(gasto.actual - gasto.anterior) });
  }

  return {
    ventas,
    utilidad,
    utilidadAnterior,
    caja,
    mesesDeRespiro,
    clientes,
    gasto,
    alertas: alertas.slice(0, MAX_ALERTAS),
  };
}
