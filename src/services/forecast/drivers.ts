import { round2 } from "@/services/money";
import type {
  BudgetProjectionResult,
  HorizonMonth,
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
