import type { CccBalanza } from "@/services/capitalTrabajoCalcs";
import { round2 } from "@/services/money";

/**
 * Plazos comerciales de Cobranza (DSO, DPO, brecha) — MISMA aritmética que
 * el catálogo #31/#32 y el módulo de capital de trabajo.
 *
 * Fuente: `cccFromBalanza` sobre la balanza del periodo (vista mensual:
 * cierre = movimiento = mes). No se reimplementa la fórmula.
 *
 * Fórmula canónica (capitalTrabajoCalcs.ts):
 *   CxC_prom = max((SI + SF)/2 del rol clientes en Activo, 0)
 *   CxP_prom = |(SI + SF)/2 del rol proveedores en Pasivo|
 *   ventas   = haber − debe del rol ingresos en categoría Ingreso
 *   COGS     = debe − haber del rol costos en categoría COGS
 *   anualiza = flujo_del_mes × 12  (meses = 1 en vista mensual)
 *   DSO = (CxC_prom / ventas_anualizadas) × 365
 *   DPO = (CxP_prom / COGS_anualizado) × 365
 *
 * Denominadores reales Compac (COMPAC_ACCOUNT_ROLES), NO 401/501 genéricos:
 *   ingresos: prefijos 4 / 401 / 410 (cuentas 4xxx del catálogo)
 *   costos:   prefijo 5 (5xxx, p. ej. 5101 costo de ventas)
 *   clientes: 1105 / 105 · proveedores: 2101 / 201
 *
 * Convención de días: ×365 sobre flujo anualizado (×12 en mensual). El spec
 * de Cobranza pedía ×365; el canónico ya lo hace así — se mantiene, no se
 * cambia a días del periodo. (El plazo medio *individual* de Concentración
 * sí usa días del periodo; es otra métrica, por cuenta.)
 *
 * Por qué NO ponderado por documento: AuxiliarMovimiento tiene fecha de
 * movimiento pero no fecha de vencimiento por factura (eso era D1, no
 * disponible). Un DSO ponderado por antigüedad real no es factible con los
 * datos actuales.
 *
 * Guardas: ventas anualizadas ≤ 0.01 → DSO = null (N/D, no 0 inventado).
 * Idem COGS para DPO. Brecha = DSO − DPO (no CCC: el CCC suma DIO).
 */

const FLOW_EPS = 0.01;

export type PlazosComerciales = {
  dso: number | null;
  dpo: number | null;
  /** DSO − DPO. Positivo = déficit (financias a clientes más que te financian). */
  brecha: number | null;
};

export type BrechaKind = "deficit" | "superavit";

export const EMPTY_PLAZOS_COMERCIALES: PlazosComerciales = {
  dso: null,
  dpo: null,
  brecha: null,
};

export function plazosComercialesFromCcc(
  ccc: Pick<CccBalanza, "dso" | "dpo" | "ventasAnualizadas" | "cogsAnualizado">,
): PlazosComerciales {
  const dso = ccc.ventasAnualizadas > FLOW_EPS ? ccc.dso : null;
  const dpo = ccc.cogsAnualizado > FLOW_EPS ? ccc.dpo : null;
  const brecha = dso != null && dpo != null ? round2(dso - dpo) : null;
  return { dso, dpo, brecha };
}

/** Déficit si DSO > DPO (brecha > 0); superávit si DSO ≤ DPO. */
export function brechaKind(brecha: number | null): BrechaKind | null {
  if (brecha == null || !Number.isFinite(brecha)) {
    return null;
  }
  return brecha > 0 ? "deficit" : "superavit";
}

/** Valor de tarjeta: 2 decimales, o N/D si el denominador no aplica. */
export function formatPlazoDias(value: number | null | undefined, na = "N/D"): string {
  if (value == null || !Number.isFinite(value)) {
    return na;
  }
  return value.toFixed(2);
}
