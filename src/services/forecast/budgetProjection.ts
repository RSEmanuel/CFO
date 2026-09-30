import { MONEY_TOLERANCE, round2 } from "../money";
import { clipNonNegative, fitHoltWintersAdditive } from "./holtWinters";
import { intervalMonths } from "./intervals";
import { reconcileEbitda, reconcilePoint } from "./reconcile";
import { seasonalNaiveFitted, seasonalNaiveForecast } from "./seasonalNaive";
import { valuesOf } from "./series";
import type {
  BudgetProjectionResult,
  ForecastMethod,
  MonthlyPnlPoint,
  OfficialVsForecast,
  RubroForecast,
  RubroKey,
  ScenarioKind,
  ScenarioMonth,
  ScenarioSliders,
} from "./types";
import { DEFAULT_SCENARIO_SLIDERS } from "./types";

const HORIZON = 12;
const HOLDOUT = 3;
const MIN_INTERVALS = 8;
const HW_MIN = 18;
const MAPE_ORIENTATIVA = 0.25;

function residualsOf(actual: number[], fitted: number[]): number[] {
  const n = Math.min(actual.length, fitted.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const y = actual[i];
    const yhat = fitted[i];
    if (y == null || yhat == null) {
      continue;
    }
    out.push(y - yhat);
  }
  return out;
}

function mape(actual: number[], predicted: number[]): number | null {
  const ratios: number[] = [];
  const n = Math.min(actual.length, predicted.length);
  for (let i = 0; i < n; i += 1) {
    const y = actual[i];
    const yhat = predicted[i];
    if (y == null || yhat == null || Math.abs(y) < MONEY_TOLERANCE) {
      continue;
    }
    ratios.push(Math.abs(y - yhat) / Math.abs(y));
  }
  if (ratios.length === 0) {
    return null;
  }
  return round2(ratios.reduce((sum, item) => sum + item, 0) / ratios.length);
}

function mae(actual: number[], predicted: number[]): number | null {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += Math.abs((actual[i] ?? 0) - (predicted[i] ?? 0));
  }
  return round2(sum / n);
}

function unavailable(key: RubroKey, reason: string): RubroForecast {
  return {
    key,
    method: "unavailable",
    mapeHoldout: null,
    months: [],
    assumptions: [reason],
  };
}

function forecastRubro(
  key: Exclude<RubroKey, "ebitda">,
  y: number[],
  anchor: string,
): RubroForecast {
  const n = y.length;
  if (n < MIN_INTERVALS) {
    return unavailable(key, "serie_insuficiente");
  }

  const assumptions: string[] = [];
  let method: ForecastMethod = "seasonal_naive";
  let point = seasonalNaiveForecast(y, HORIZON);
  let fitted = seasonalNaiveFitted(y);

  const hw = n >= HW_MIN ? fitHoltWintersAdditive(y) : null;
  if (hw) {
    method = "holt_winters";
    point = hw.forecast(HORIZON);
    fitted = hw.fitted;
    assumptions.push("Holt-Winters aditivo s=12 con α=0.3, β=0.05, γ=0.2 fijos.");
  } else {
    assumptions.push("Seasonal naïve: el mismo mes del año anterior es el predictor más estable con estacionalidad de calendario.");
  }

  const clipped = clipNonNegative(point);
  point = clipped.values;
  if (clipped.clipped) {
    assumptions.push("Valores negativos recortados a 0 (ingreso/costo/gasto no pueden ser < 0).");
  }

  const holdStart = Math.max(0, n - HOLDOUT);
  const train = y.slice(0, holdStart);
  let holdPred: number[] = [];
  if (train.length >= MIN_INTERVALS) {
    const hwHold = train.length >= HW_MIN ? fitHoltWintersAdditive(train) : null;
    holdPred = hwHold ? clipNonNegative(hwHold.forecast(HOLDOUT)).values : seasonalNaiveForecast(train, HOLDOUT);
  } else {
    holdPred = seasonalNaiveForecast(train.length ? train : y, HOLDOUT).slice(0, n - holdStart);
  }
  const holdActual = y.slice(holdStart);
  const mapeHoldout = mape(holdActual, holdPred);
  const maeHoldout = mae(holdActual, holdPred);
  if (maeHoldout != null) {
    assumptions.push(`Hold-out 3 meses MAE=${maeHoldout}.`);
  }
  if (key === "ingreso" && mapeHoldout != null && mapeHoldout > MAPE_ORIENTATIVA) {
    assumptions.push("La proyección es orientativa, no un presupuesto (MAPE de ingreso en hold-out > 25%).");
  }

  const res = residualsOf(y, fitted);
  const months = intervalMonths(anchor, point, res);

  return { key, method, mapeHoldout, months, assumptions };
}

export function projectFromPoints(
  points: MonthlyPnlPoint[],
  sliders: ScenarioSliders = DEFAULT_SCENARIO_SLIDERS,
  hasOfficialBudget = false,
  anchorPeriodo?: string,
): BudgetProjectionResult {
  const eligible = anchorPeriodo ? points.filter((point) => point.periodo <= anchorPeriodo) : points;
  const anchor = anchorPeriodo ?? eligible[eligible.length - 1]?.periodo ?? "2025-12";

  const ingreso = forecastRubro("ingreso", valuesOf(eligible, "ingreso"), anchor);
  const costo = forecastRubro("costo", valuesOf(eligible, "costo"), anchor);
  const gasto = forecastRubro("gasto", valuesOf(eligible, "gasto"), anchor);

  const ebitdaMonths =
    ingreso.method === "unavailable" || costo.method === "unavailable" || gasto.method === "unavailable"
      ? []
      : reconcileEbitda(ingreso.months, costo.months, gasto.months);

  const orientativa = (ingreso.mapeHoldout ?? 0) > MAPE_ORIENTATIVA;
  const ebitdaAssumptions = ["EBITDA reconciliado: ingreso − costo − gasto (no se proyecta aparte)."];
  if (orientativa) {
    ebitdaAssumptions.push("La proyección es orientativa, no un presupuesto (MAPE de ingreso en hold-out > 25%).");
  }

  const ebitda: RubroForecast = {
    key: "ebitda",
    method:
      ingreso.method === "unavailable" || costo.method === "unavailable" || gasto.method === "unavailable"
        ? "unavailable"
        : ingreso.method,
    mapeHoldout: null,
    months: ebitdaMonths,
    assumptions: ebitdaAssumptions,
  };

  const rubros: Record<RubroKey, RubroForecast> = { ingreso, costo, gasto, ebitda };

  const scenarios = buildScenarios(rubros, sliders);
  const officialVsP50 = buildOfficialCompare(eligible, rubros, hasOfficialBudget);

  return {
    hasOfficialBudget,
    methodNote:
      ingreso.method === "holt_winters"
        ? "Holt-Winters aditivo si n≥18; si no, seasonal naïve."
        : ingreso.method === "unavailable"
          ? "serie_insuficiente"
          : "Seasonal naïve (mismo mes YoY).",
    rubros,
    scenarios,
    officialVsP50,
    orientativa,
  };
}

function buildScenarios(
  rubros: Record<RubroKey, RubroForecast>,
  sliders: ScenarioSliders,
): Record<ScenarioKind, ScenarioMonth[]> {
  const months = rubros.ingreso.months;
  const base: ScenarioMonth[] = months.map((ing, index) => {
    const costo = rubros.costo.months[index];
    const gasto = rubros.gasto.months[index];
    const ingresoP = ing.p50;
    const costoP = costo?.p50 ?? 0;
    const gastoP = gasto?.p50 ?? 0;
    return {
      periodo: ing.periodo,
      ingreso: ingresoP,
      costo: costoP,
      gasto: gastoP,
      ebitda: reconcilePoint(ingresoP, costoP, gastoP),
    };
  });
  const upside: ScenarioMonth[] = base.map((row) => {
    const ingreso = round2(row.ingreso * (1 + sliders.gIngreso));
    const costo = round2(row.costo * (1 + sliders.gCosto));
    const gasto = round2(row.gasto * (1 + sliders.gGasto));
    return { periodo: row.periodo, ingreso, costo, gasto, ebitda: reconcilePoint(ingreso, costo, gasto) };
  });
  const downside: ScenarioMonth[] = months.map((ing, index) => {
    const costo = rubros.costo.months[index];
    const gasto = rubros.gasto.months[index];
    const ingreso = ing.p20;
    const costoP = costo?.p80 ?? 0;
    const gastoP = gasto?.p80 ?? 0;
    return {
      periodo: ing.periodo,
      ingreso,
      costo: costoP,
      gasto: gastoP,
      ebitda: reconcilePoint(ingreso, costoP, gastoP),
    };
  });
  return { base, upside, downside };
}

function buildOfficialCompare(
  points: MonthlyPnlPoint[],
  rubros: Record<RubroKey, RubroForecast>,
  hasOfficial: boolean,
): OfficialVsForecast[] {
  const last = points[points.length - 1];
  if (!last) {
    return [];
  }
  const p50 = {
    ingreso: rubros.ingreso.months[0]?.p50 ?? null,
    costo: rubros.costo.months[0]?.p50 ?? null,
    gasto: rubros.gasto.months[0]?.p50 ?? null,
    ebitda: rubros.ebitda.months[0]?.p50 ?? null,
  };
  return [
    {
      periodo: last.periodo,
      actual: { ingreso: last.ingreso, costo: last.costo, gasto: last.gasto, ebitda: last.ebitda },
      official: hasOfficial
        ? { ingreso: last.officialIngreso, costo: last.officialCosto, gasto: last.officialGasto }
        : null,
      p50:
        p50.ingreso == null || p50.costo == null || p50.gasto == null || p50.ebitda == null
          ? null
          : { ingreso: p50.ingreso, costo: p50.costo, gasto: p50.gasto, ebitda: p50.ebitda },
    },
  ];
}

export function nowcastRubro(
  points: MonthlyPnlPoint[],
  key: Exclude<RubroKey, "ebitda">,
  periodo: string,
): number | null {
  const training = points.filter((point) => point.periodo < periodo);
  if (training.length < MIN_INTERVALS) {
    return null;
  }
  const anchor = training[training.length - 1]?.periodo;
  if (!anchor) {
    return null;
  }
  const forecast = forecastRubro(key, valuesOf(training, key), anchor);
  return forecast.months.find((month) => month.periodo === periodo)?.p50 ?? null;
}
