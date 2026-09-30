import { round2 } from "@/services/money";

/**
 * Concentración & Riesgo (Pareto 80/20 + índice Herfindahl-Hirschman).
 *
 * Decisiones metodológicas (documentadas a petición del spec):
 *
 * 1. MONTO BASE por cuenta: primario = actividad del periodo (clientes:
 *    facturado = cargos del auxiliar; proveedores: comprado = abonos).
 *    Fallback: si la actividad del mes es 0 pero la cuenta tiene saldo
 *    pendiente > 0 (exposición abierta), entra al universo con monto =
 *    saldo pendiente y se marca `baseMonto: "saldo_pendiente"`.
 *    Justificación: en periodos reales muchas cuentas no tienen actividad
 *    en el mes (jul-2026: 10/98 clientes y 1/9 proveedores con movimiento);
 *    sin el fallback el universo quedaría reducido a las cuentas con
 *    actividad e ignoraría la exposición abierta heredada.
 *
 * 2. PLAZO MEDIO de pago/cobro por cuenta (DSO/DPO individual aproximado):
 *    plazo = (saldoPromedio / actividadDelPeriodo) × díasDelPeriodo, con
 *    saldoPromedio = (saldoInicial + saldoFinal) / 2. Es la aproximación
 *    clásica de DSO por saldo promedio. Se devuelve null cuando la
 *    actividad del periodo es <= 0 (no hay flujo contra el cual medir
 *    velocidad) o cuando el saldo promedio es <= 0 (saldo acreedor: la
 *    cuenta no representa exposición).
 *
 * 3. CLASIFICACIÓN DE RIESGO por participación individual:
 *    - pct > 25%  → "vulnerable"   (dependencia crítica de una sola cuenta)
 *    - 10–25%     → "estrategico"  (relación relevante; monitorear)
 *    - < 10%      → "diversificado"
 *
 * 4. MONEDA: el HHI y el Pareto se calculan por moneda por separado
 *    (mezclar MXN y USD distorsiona las participaciones por el tipo de
 *    cambio). El servicio de BD sirve una moneda por petición.
 *
 * 5. HHI = Σ participación_i² con participaciones en escala 0–100
 *    (rango 0–10,000). Niveles (umbrales US DOJ/FTC):
 *    < 1,500 baja concentración · 1,500–2,500 moderada · > 2,500 alta.
 */

export type RiesgoClasificacion = "vulnerable" | "estrategico" | "diversificado";
export type HhiNivel = "baja" | "moderada" | "alta";
export type BaseMonto = "actividad" | "saldo_pendiente";

export type ConcentracionCuentaInput = {
  accountId: string;
  entityName: string;
  /** Actividad del periodo: facturado (clientes) / comprado (proveedores). */
  montoPeriodo: number;
  saldoInicial: number;
  saldoFinal: number;
};

export type ConcentracionRow = {
  accountId: string;
  entityName: string;
  /** Monto usado en el universo (actividad del mes o saldo pendiente). */
  monto: number;
  baseMonto: BaseMonto;
  /** Participación individual 0–100. */
  pctIndividual: number;
  /** Participación acumulada 0–100 (orden desc por monto). */
  pctAcumulado: number;
  /** DSO/DPO individual aproximado en días; null si no aplica. */
  plazoMedioDias: number | null;
  clasificacion: RiesgoClasificacion;
};

export type ConcentracionModel = {
  /** Suma de montos del universo. */
  total: number;
  /** Número de cuentas en el universo. */
  cuentas: number;
  /** Índice Herfindahl-Hirschman 0–10,000; null si no hay universo. */
  hhi: number | null;
  hhiNivel: HhiNivel | null;
  /** N de cuentas (orden desc) que acumulan al menos el 80% del total. */
  paretoN: number | null;
  /** Participación acumulada de las 3 cuentas mayores (0–100). */
  top3Share: number | null;
  rows: ConcentracionRow[];
};

export const HHI_UMBRAL_MODERADA = 1500;
export const HHI_UMBRAL_ALTA = 2500;
export const PARETO_UMBRAL_PCT = 80;
export const RIESGO_UMBRAL_VULNERABLE_PCT = 25;
export const RIESGO_UMBRAL_ESTRATEGICO_PCT = 10;

export function clasificaHhi(hhi: number): HhiNivel {
  if (hhi < HHI_UMBRAL_MODERADA) return "baja";
  if (hhi <= HHI_UMBRAL_ALTA) return "moderada";
  return "alta";
}

export function clasificaRiesgoCuenta(pctIndividual: number): RiesgoClasificacion {
  if (pctIndividual > RIESGO_UMBRAL_VULNERABLE_PCT) return "vulnerable";
  if (pctIndividual >= RIESGO_UMBRAL_ESTRATEGICO_PCT) return "estrategico";
  return "diversificado";
}

/** DSO/DPO individual: (saldo promedio / actividad) × días del periodo. */
export function plazoMedioDias(
  saldoInicial: number,
  saldoFinal: number,
  montoPeriodo: number,
  diasPeriodo: number,
): number | null {
  if (montoPeriodo <= 0 || diasPeriodo <= 0) return null;
  const saldoPromedio = (saldoInicial + saldoFinal) / 2;
  if (saldoPromedio <= 0) return null;
  return round2((saldoPromedio / montoPeriodo) * diasPeriodo);
}

export function buildConcentracion(
  inputs: ConcentracionCuentaInput[],
  diasPeriodo: number,
): ConcentracionModel {
  const universo = inputs
    .map((input) => {
      const montoPeriodo = round2(input.montoPeriodo);
      const saldoFinal = round2(input.saldoFinal);
      if (montoPeriodo > 0) {
        return { ...input, monto: montoPeriodo, baseMonto: "actividad" as const };
      }
      if (saldoFinal > 0) {
        return { ...input, monto: saldoFinal, baseMonto: "saldo_pendiente" as const };
      }
      return null;
    })
    .filter((row): row is ConcentracionCuentaInput & { monto: number; baseMonto: BaseMonto } => row != null)
    .sort((a, b) => b.monto - a.monto || a.entityName.localeCompare(b.entityName));

  const total = round2(universo.reduce((sum, row) => sum + row.monto, 0));
  if (total <= 0 || universo.length === 0) {
    return { total: 0, cuentas: 0, hhi: null, hhiNivel: null, paretoN: null, top3Share: null, rows: [] };
  }

  let acumulado = 0;
  let hhiRaw = 0;
  let paretoN: number | null = null;
  const rows: ConcentracionRow[] = universo.map((row, index) => {
    const pct = (row.monto / total) * 100;
    acumulado += pct;
    hhiRaw += pct * pct;
    if (paretoN == null && acumulado >= PARETO_UMBRAL_PCT) {
      paretoN = index + 1;
    }
    return {
      accountId: row.accountId,
      entityName: row.entityName,
      monto: row.monto,
      baseMonto: row.baseMonto,
      pctIndividual: round2(pct),
      pctAcumulado: round2(Math.min(acumulado, 100)),
      plazoMedioDias: plazoMedioDias(row.saldoInicial, row.saldoFinal, row.montoPeriodo, diasPeriodo),
      clasificacion: clasificaRiesgoCuenta(pct),
    };
  });

  const hhi = round2(hhiRaw);
  const top3Share = round2(Math.min(rows.slice(0, 3).reduce((sum, row) => sum + row.pctIndividual, 0), 100));

  return {
    total,
    cuentas: rows.length,
    hhi,
    hhiNivel: clasificaHhi(hhi),
    paretoN: paretoN ?? rows.length,
    top3Share,
    rows,
  };
}
