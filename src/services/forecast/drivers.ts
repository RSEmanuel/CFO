import { round2 } from "@/services/money";
import type {
  BudgetProjectionResult,
  HorizonMonth,
  MonthlyPnlPoint,
  RubroForecast,
  ScenarioMonth,
} from "@/services/forecast/types";

export type BudgetDrivers = {
  salesGrowthPct: number;
  inflationPct: number;
  headcount: number;
  headcountCostMonthly: number;
  debtInterestMonthly: number;
  depreciationMonthly: number;
};

export const DEFAULT_BUDGET_DRIVERS: BudgetDrivers = {
  salesGrowthPct: 0,
  inflationPct: 0,
  headcount: 0,
  headcountCostMonthly: 0,
  debtInterestMonthly: 0,
  depreciationMonthly: 0,
};

/** De dónde salen los supuestos de la proyección: calculados por Cifra o guardados por el usuario. */
export type BudgetAssumptionsSource = "auto" | "manual";

/**
 * Inflación anual que la proyección automática aplica a costos y gastos: referencia fija cercana a la
 * inflación general reciente en México (meta de Banxico 3% ± 1 pt). Es un supuesto declarado, no un dato
 * del tenant; quien quiera otro valor lo ajusta en "Ajustar supuestos (avanzado)".
 */
export const AUTO_INFLATION_PCT = 4.5;

/** Límites del crecimiento anual automático, para que un par de meses atípicos no disparen la proyección. */
export const AUTO_SALES_GROWTH_MIN_PCT = -10;
export const AUTO_SALES_GROWTH_MAX_PCT = 30;

const AUTO_GROWTH_MIN_MONTHS = 6;
const AUTO_GROWTH_MAX_MONTHS = 12;

/**
 * Crecimiento anual de ventas según la tendencia reciente: ajuste log-lineal sobre los últimos 6-12 meses
 * con ingreso positivo (la pendiente es el crecimiento promedio mensual), anualizado y acotado.
 * Con menos de 6 meses no hay tendencia confiable y regresa 0.
 */
export function deriveSalesGrowthPct(history: MonthlyPnlPoint[]): number {
  const recent = history.filter((point) => point.ingreso > 0).slice(-AUTO_GROWTH_MAX_MONTHS);
  if (recent.length < AUTO_GROWTH_MIN_MONTHS) {
    return 0;
  }
  const n = recent.length;
  const xs = recent.map((_, index) => index);
  const ys = recent.map((point) => Math.log(point.ingreso));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let index = 0; index < n; index += 1) {
    num += (xs[index] - meanX) * (ys[index] - meanY);
    den += (xs[index] - meanX) ** 2;
  }
  const monthlyRate = Math.exp(den === 0 ? 0 : num / den) - 1;
  const annualPct = ((1 + monthlyRate) ** 12 - 1) * 100;
  const bounded = Math.min(AUTO_SALES_GROWTH_MAX_PCT, Math.max(AUTO_SALES_GROWTH_MIN_PCT, annualPct));
  return Math.round(bounded * 10) / 10;
}

/** Supuestos que Cifra usa cuando el tenant no ha guardado los suyos. */
export function deriveAutoBudgetDrivers(history: MonthlyPnlPoint[]): BudgetDrivers {
  return {
    salesGrowthPct: deriveSalesGrowthPct(history),
    inflationPct: AUTO_INFLATION_PCT,
    headcount: 0,
    headcountCostMonthly: 0,
    debtInterestMonthly: 0,
    depreciationMonthly: 0,
  };
}

/** Los supuestos guardados mandan; sin ellos se usan los automáticos. */
export function resolveBudgetDrivers(
  saved: BudgetDrivers | null,
  history: MonthlyPnlPoint[],
): { drivers: BudgetDrivers; source: BudgetAssumptionsSource } {
  return saved ? { drivers: saved, source: "manual" } : { drivers: deriveAutoBudgetDrivers(history), source: "auto" };
}

/**
 * Proyección final con sus supuestos. Si la base ya extrapola la tendencia (Holt-Winters, desde 18
 * meses), los supuestos automáticos no se vuelven a aplicar: multiplicar encima contaría la tendencia dos
 * veces. Con menos historial la base repite el año anterior y ahí sí se aplican. Los supuestos guardados
 * por el usuario siempre se aplican.
 */
export function resolveProjectionDrivers(
  base: BudgetProjectionResult,
  saved: BudgetDrivers | null,
  history: MonthlyPnlPoint[],
): {
  projection: BudgetProjectionResult;
  drivers: BudgetDrivers;
  source: BudgetAssumptionsSource;
  driversApplied: boolean;
} {
  if (saved) {
    return { projection: applyBudgetDrivers(base, saved), drivers: saved, source: "manual", driversApplied: true };
  }
  if (base.rubros.ingreso.method === "holt_winters") {
    return { projection: base, drivers: { ...DEFAULT_BUDGET_DRIVERS }, source: "auto", driversApplied: false };
  }
  const drivers = deriveAutoBudgetDrivers(history);
  return { projection: applyBudgetDrivers(base, drivers), drivers, source: "auto", driversApplied: true };
}

function scaleMonth(month: HorizonMonth, factor: number, additive: number): HorizonMonth {
  return {
    periodo: month.periodo,
    p20: round2(month.p20 * factor + additive),
    p50: round2(month.p50 * factor + additive),
    p80: round2(month.p80 * factor + additive),
  };
}

export function applyBudgetDrivers(
  projection: BudgetProjectionResult,
  drivers: BudgetDrivers,
): BudgetProjectionResult {
  const ingresoFactor = 1 + drivers.salesGrowthPct / 100;
  const costoFactor = 1 + drivers.inflationPct / 100;
  const gastoAdditive = round2(drivers.headcount * drivers.headcountCostMonthly);

  const mapRubro = (
    rubro: RubroForecast,
    factor: number,
    additive: number,
  ): RubroForecast => ({
    ...rubro,
    months: rubro.months.map((month) => scaleMonth(month, factor, additive)),
  });

  const ingreso = mapRubro(projection.rubros.ingreso, ingresoFactor, 0);
  const costo = mapRubro(projection.rubros.costo, costoFactor, 0);
  const gasto = mapRubro(projection.rubros.gasto, costoFactor, gastoAdditive);
  const ebitda: RubroForecast = {
    ...projection.rubros.ebitda,
    months: projection.rubros.ebitda.months.map((month, index) => ({
      periodo: month.periodo,
      p20: round2(
        (ingreso.months[index]?.p20 ?? 0) -
          (costo.months[index]?.p80 ?? 0) -
          (gasto.months[index]?.p80 ?? 0),
      ),
      p50: round2(
        (ingreso.months[index]?.p50 ?? 0) -
          (costo.months[index]?.p50 ?? 0) -
          (gasto.months[index]?.p50 ?? 0),
      ),
      p80: round2(
        (ingreso.months[index]?.p80 ?? 0) -
          (costo.months[index]?.p20 ?? 0) -
          (gasto.months[index]?.p20 ?? 0),
      ),
    })),
  };

  const mapScenario = (months: ScenarioMonth[]): ScenarioMonth[] =>
    months.map((month) => {
      const ingresoValue = round2(month.ingreso * ingresoFactor);
      const costoValue = round2(month.costo * costoFactor);
      const gastoValue = round2(month.gasto * costoFactor + gastoAdditive);
      return {
        periodo: month.periodo,
        ingreso: ingresoValue,
        costo: costoValue,
        gasto: gastoValue,
        ebitda: round2(ingresoValue - costoValue - gastoValue),
      };
    });

  return {
    ...projection,
    rubros: { ingreso, costo, gasto, ebitda },
    scenarios: {
      base: mapScenario(projection.scenarios.base),
      upside: mapScenario(projection.scenarios.upside),
      downside: mapScenario(projection.scenarios.downside),
    },
    officialVsP50: projection.officialVsP50.map((row, index) => ({
      ...row,
      p50: row.p50
        ? {
            ingreso: ingreso.months[index]?.p50 ?? row.p50.ingreso,
            costo: costo.months[index]?.p50 ?? row.p50.costo,
            gasto: gasto.months[index]?.p50 ?? row.p50.gasto,
            ebitda: ebitda.months[index]?.p50 ?? row.p50.ebitda,
          }
        : null,
    })),
  };
}
