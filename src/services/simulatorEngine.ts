import { DEFAULT_TAX_RATE } from "@/services/financialSnapshot";
import { round2 } from "@/services/money";

/**
 * Motor del Simulador de Sensibilidad Financiera & Escenarios What-If.
 *
 * Puro (sin IO): recibe la línea base canónica compuesta por
 * `simulatorBaselineService` (buckets del ER vía `computeErBuckets`, CCC vía
 * `cccFromBalanza`, deuda/caja/runway vía `buildPeriodSnapshot`) y aplica
 * deltas acotados en memoria. Nunca toca la base de datos.
 *
 * CONVENCIONES DEL MOTOR (documentadas para paridad con el catálogo):
 *
 * 1. Ingresos: `ventas_sim = ventas × (1 + g)`. El crecimiento g arrastra el
 *    costo variable: `cogs_sim = cogs × (1 + g) × (1 − s)`, donde s es la
 *    sensibilidad de precio/margen: s > 0 MEJORA la absorción del costo
 *    (menor ratio COGS/ventas, p. ej. por aumento de precios sin costo
 *    incremental) y s < 0 la deteriora. Con s = 0 el COGS crece al mismo
 *    ritmo que las ventas (margen bruto % constante).
 * 2. OPEX fijo: los gastos operativos NO escalan con ventas; solo se mueven
 *    con el driver o: `sga_sim = sga × (1 + o)`. La D&A queda fuera del
 *    driver (es no-cash y depende del calendario de depreciación): se
 *    desacopla del OPEX con la misma convención del snapshot
 *    (`sga = max(totalOpex − da, 0)`) y se reintegra constante, así
 *    `ebitda_sim = utilidadBruta_sim − sga_sim` y `ebit_sim = ebitda_sim − da`.
 * 3. RIF: los productos financieros no cambian. Los gastos financieros se
 *    reprecian con el delta de tasa Δpp (puntos porcentuales ANUALES) sobre
 *    la deuda financiera viva: `gastoFin_sim = gastoFin + deuda × Δpp/100/12`
 *    (vista mensual). Es equivalente a `deuda × (kd_mensual + Δpp/12)` con
 *    `kd_mensual = gastoFin/deuda`, pero en forma aditiva para que Δpp = 0
 *    reproduzca el baseline al centavo. Sin deuda (≤ $0.01) no hay nada que
 *    repreciar y el gasto financiero queda igual.
 * 4. Impuestos: `impuestos_sim = max(0, ebt_sim) × tasa`, con
 *    `tasa = tasaEfectivaBaseline` si el periodo provisionó (tasa > 0) o el
 *    fallback 30% (`DEFAULT_TAX_RATE` del catálogo, mismo criterio que NOPAT)
 *    cuando la tasa real del periodo es 0. Con EBT ≤ 0 no hay provisión.
 * 5. Caja: `ΔCaja = ΔEBITDA − ΔNWC`, con `ΔNWC = ΔCxC − ΔCxP`. Los deltas de
 *    capital de trabajo usan la MISMA base anualizada que la definición
 *    canónica de DSO/DPO (catálogo #31/#32: saldo promedio / flujo anualizado
 *    × 365): `ΔCxC = (ventas_sim_anualizadas/365) × ΔDSO` y
 *    `ΔCxP = (cogs_sim_anualizado/365) × ΔDPO`, donde la anualización del
 *    escenario replica el factor del baseline (×12 en vista mensual). Signos:
 *    más DSO → más CxC → CONSUME caja; más DPO → más CxP → LIBERA caja.
 * 6. CCC sim = DSO_sim + DIO − DPO_sim (DIO sin driver: se conserva).
 * 7. Cash runway con la MISMA definición del catálogo (#28): caja / salidas
 *    operativas del mes. La caja simulada es `caja + ΔCaja` y el burn se
 *    recalcula con el escenario escalando las salidas operativas base por el
 *    cambio en el costo operativo de caja: `burn_sim = burn × (cogs_sim +
 *    sga_sim)/(cogs + sga)` (si el costo base ≈ 0, burn sin cambio). Sin burn
 *    medible (≤ $0.01) el runway queda null, igual que en el catálogo.
 * 8. Guardas: toda división por denominador ≈ 0 devuelve null (patrón
 *    safeRatio) y los deltas se clampean a su rango antes de aplicarse.
 */

export type SimulatorBaseline = {
  tenantId: string;
  anio: number;
  /** Mes 1-12 (el baseline siempre es un periodo mensual). */
  periodo: number;
  // PyG canónico del mes (computeErBuckets sobre la balanza del periodo).
  ventas: number;
  cogs: number;
  /** totalOpex del ER (incluye D&A contable 6301 e interna). */
  opex: number;
  /** D&A total del ER (6301 + cuentas PyG de depreciación en 6101/6201). */
  da: number;
  ebit: number;
  ebitda: number;
  productosFinancieros: number;
  gastosFinancieros: number;
  rif: number;
  ebt: number;
  /** PTU + ISR provisionados en el periodo. */
  impuestos: number;
  utilidadNeta: number;
  // Capital de trabajo canónico (cccFromBalanza, mismos insumos que el snapshot).
  dso: number;
  dio: number;
  dpo: number;
  ccc: number;
  ventasAnualizadas: number;
  cogsAnualizado: number;
  // Balance / tesorería (buildPeriodSnapshot).
  deudaFinanciera: number;
  caja: number;
  /** Salidas operativas del mes (tesorería): burn de la métrica #28. */
  salidasOperativas: number;
  /** Tasa efectiva REAL del periodo (impuestos/ebt; 0 si no hubo provisión). */
  tasaEfectiva: number;
  /** Costo de deuda implícito del periodo (gastosFinancieros/deuda), mensual. */
  costoDeudaMensual: number;
};

export type SimulatorDeltas = {
  /** Crecimiento de ventas %: −30…+30. */
  crecimientoVentasPct: number;
  /** Sensibilidad precio/margen % (absorción de COGS): −10…+10. */
  sensibilidadPreciosPct: number;
  /** Variación de OPEX %: −20…+20. */
  variacionOpexPct: number;
  /** Delta DSO en días: −15…+30. */
  dsoDias: number;
  /** Delta DPO en días: −15…+30. */
  dpoDias: number;
  /** Delta de tasa de interés en pp anuales: −3…+5. */
  tasaInteresDeltaPp: number;
};

export type SimulatorDriverKey = keyof SimulatorDeltas;

export const DELTA_LIMITS: Record<SimulatorDriverKey, { min: number; max: number }> = {
  crecimientoVentasPct: { min: -30, max: 30 },
  sensibilidadPreciosPct: { min: -10, max: 10 },
  variacionOpexPct: { min: -20, max: 20 },
  dsoDias: { min: -15, max: 30 },
  dpoDias: { min: -15, max: 30 },
  tasaInteresDeltaPp: { min: -3, max: 5 },
};

export const ZERO_DELTAS: SimulatorDeltas = {
  crecimientoVentasPct: 0,
  sensibilidadPreciosPct: 0,
  variacionOpexPct: 0,
  dsoDias: 0,
  dpoDias: 0,
  tasaInteresDeltaPp: 0,
};

/** Fallback documentado: mismo criterio que el NOPAT del catálogo. */
export const SIMULATOR_TAX_FALLBACK = DEFAULT_TAX_RATE;

const DAYS_IN_YEAR = 365;

export type SimulationResult = {
  /** Deltas efectivamente aplicados (ya clampeados al rango). */
  deltas: SimulatorDeltas;
  ingresos: number;
  cogs: number;
  utilidadBruta: number;
  /** OPEX simulado comparable al baseline: sga_sim + D&A constante. */
  opex: number;
  sga: number;
  da: number;
  ebit: number;
  ebitda: number;
  margenEbitdaPct: number | null;
  productosFinancieros: number;
  gastosFinancieros: number;
  rif: number;
  ebt: number;
  /** Tasa aplicada a la provisión: real del periodo o fallback 30%. */
  tasaAplicada: number;
  impuestos: number;
  utilidadNeta: number;
  margenNetoPct: number | null;
  dso: number;
  dio: number;
  dpo: number;
  ccc: number;
  deltaCxc: number;
  deltaCxp: number;
  deltaNwc: number;
  deltaEbitda: number;
  /** ΔCaja = ΔEBITDA − ΔNWC. Positivo = caja liberada; negativo = requerida. */
  deltaCaja: number;
  caja: number;
  burnMensual: number | null;
  /** Meses de caja, misma definición que la métrica #28 del catálogo. */
  cashRunwayMeses: number | null;
};

function clampDriver(key: SimulatorDriverKey, value: number): number {
  const { min, max } = DELTA_LIMITS[key];
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(min, value));
}

/** Normaliza deltas parciales/inválidos: default 0 y clamp al rango. */
export function clampDeltas(deltas: Partial<SimulatorDeltas> | null | undefined): SimulatorDeltas {
  return {
    crecimientoVentasPct: clampDriver("crecimientoVentasPct", deltas?.crecimientoVentasPct ?? 0),
    sensibilidadPreciosPct: clampDriver("sensibilidadPreciosPct", deltas?.sensibilidadPreciosPct ?? 0),
    variacionOpexPct: clampDriver("variacionOpexPct", deltas?.variacionOpexPct ?? 0),
    dsoDias: clampDriver("dsoDias", deltas?.dsoDias ?? 0),
    dpoDias: clampDriver("dpoDias", deltas?.dpoDias ?? 0),
    tasaInteresDeltaPp: clampDriver("tasaInteresDeltaPp", deltas?.tasaInteresDeltaPp ?? 0),
  };
}

function marginPct(parte: number, ventas: number): number | null {
  return Math.abs(ventas) > 0.005 ? round2((parte / ventas) * 100) : null;
}

export function simulate(baseline: SimulatorBaseline, deltas: Partial<SimulatorDeltas>): SimulationResult {
  const d = clampDeltas(deltas);
  const g = d.crecimientoVentasPct / 100;
  const s = d.sensibilidadPreciosPct / 100;
  const o = d.variacionOpexPct / 100;

  // SG&A = OPEX sin D&A (convención del snapshot: max(totalOpex − da, 0)).
  const sgaBase = round2(Math.max(baseline.opex - baseline.da, 0));

  const ingresos = round2(baseline.ventas * (1 + g));
  const cogs = round2(baseline.cogs * (1 + g) * (1 - s));
  const utilidadBruta = round2(ingresos - cogs);
  const sga = round2(sgaBase * (1 + o));
  const opex = round2(sga + baseline.da);
  const ebitda = round2(utilidadBruta - sga);
  const ebit = round2(ebitda - baseline.da);

  const gastosFinancieros =
    baseline.deudaFinanciera > 0.01
      ? round2(baseline.gastosFinancieros + (baseline.deudaFinanciera * d.tasaInteresDeltaPp) / 100 / 12)
      : baseline.gastosFinancieros;
  const productosFinancieros = baseline.productosFinancieros;
  const rif = round2(productosFinancieros - gastosFinancieros);
  const ebt = round2(ebit + rif);

  const tasaAplicada = baseline.tasaEfectiva > 0.0001 ? baseline.tasaEfectiva : SIMULATOR_TAX_FALLBACK;
  const impuestos = round2(Math.max(0, ebt) * tasaAplicada);
  const utilidadNeta = round2(ebt - impuestos);

  const dso = round2(baseline.dso + d.dsoDias);
  const dpo = round2(baseline.dpo + d.dpoDias);
  const ccc = round2(dso + baseline.dio - dpo);

  // Misma base anualizada que la definición canónica de DSO/DPO (×12 mensual).
  const factorVentas = baseline.ventas > 0.01 ? baseline.ventasAnualizadas / baseline.ventas : 12;
  const factorCogs = baseline.cogs > 0.01 ? baseline.cogsAnualizado / baseline.cogs : 12;
  const deltaCxc = round2(((ingresos * factorVentas) / DAYS_IN_YEAR) * d.dsoDias);
  const deltaCxp = round2(((cogs * factorCogs) / DAYS_IN_YEAR) * d.dpoDias);
  const deltaNwc = round2(deltaCxc - deltaCxp);

  const deltaEbitda = round2(ebitda - baseline.ebitda);
  const deltaCaja = round2(deltaEbitda - deltaNwc);
  const caja = round2(baseline.caja + deltaCaja);

  const costoCajaBase = round2(sgaBase + baseline.cogs);
  const costoCajaSim = round2(sga + cogs);
  const burnMensual =
    baseline.salidasOperativas > 0.01
      ? round2(costoCajaBase > 0.01 ? (baseline.salidasOperativas * costoCajaSim) / costoCajaBase : baseline.salidasOperativas)
      : null;
  const cashRunwayMeses = burnMensual != null && burnMensual > 0.01 ? round2(caja / burnMensual) : null;

  return {
    deltas: d,
    ingresos,
    cogs,
    utilidadBruta,
    opex,
    sga,
    da: baseline.da,
    ebit,
    ebitda,
    margenEbitdaPct: marginPct(ebitda, ingresos),
    productosFinancieros,
    gastosFinancieros,
    rif,
    ebt,
    tasaAplicada,
    impuestos,
    utilidadNeta,
    margenNetoPct: marginPct(utilidadNeta, ingresos),
    dso,
    dio: baseline.dio,
    dpo,
    ccc,
    deltaCxc,
    deltaCxp,
    deltaNwc,
    deltaEbitda,
    deltaCaja,
    caja,
    burnMensual,
    cashRunwayMeses,
  };
}

/**
 * Derivados del baseline con las MISMAS guardas del motor/catálogo, para que
 * la UI muestre la columna "Base" sin duplicar aritmética: márgenes sobre
 * ventas (guarda safeRatio) y runway #28 (caja / salidas operativas del mes).
 */
export function baselineDerived(baseline: SimulatorBaseline): {
  sga: number;
  margenEbitdaPct: number | null;
  margenNetoPct: number | null;
  cashRunwayMeses: number | null;
} {
  return {
    sga: round2(Math.max(baseline.opex - baseline.da, 0)),
    margenEbitdaPct: marginPct(baseline.ebitda, baseline.ventas),
    margenNetoPct: marginPct(baseline.utilidadNeta, baseline.ventas),
    cashRunwayMeses:
      baseline.salidasOperativas > 0.01 ? round2(baseline.caja / baseline.salidasOperativas) : null,
  };
}

export type TornadoRow = {
  driver: SimulatorDriverKey;
  /** ΔCaja con el driver en su mínimo de rango (resto en 0). */
  low: number;
  /** ΔCaja con el driver en su máximo de rango (resto en 0). */
  high: number;
  /** max(|low|, |high|) para ordenar el tornado. */
  span: number;
};

/**
 * Sensibilidad por driver sobre ΔCaja: cada driver se lleva a sus extremos de
 * rango con los demás en 0. Nota: la tasa de interés no mueve la caja
 * operativa del mes (ΔCaja = ΔEBITDA − ΔNWC); su efecto es vía utilidad neta.
 */
export function sensitivityTornado(baseline: SimulatorBaseline): TornadoRow[] {
  const rows = (Object.keys(DELTA_LIMITS) as SimulatorDriverKey[]).map((driver) => {
    const { min, max } = DELTA_LIMITS[driver];
    const low = simulate(baseline, { [driver]: min }).deltaCaja;
    const high = simulate(baseline, { [driver]: max }).deltaCaja;
    return { driver, low, high, span: round2(Math.max(Math.abs(low), Math.abs(high))) };
  });
  return rows.sort((a, b) => b.span - a.span);
}
