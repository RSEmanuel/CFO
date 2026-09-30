import type { DestacadosPeriodTotals } from "@/services/financialDataTransformer";

const MONEY_TOLERANCE = 0.01;

export type ResultadosWaterfallKind = "total" | "subtotal" | "decrease" | "increase";

export type ResultadosWaterfallStepId =
  | "income"
  | "costs"
  | "grossProfit"
  | "expenses"
  | "operatingResult"
  | "da"
  | "ebitda";

export type ResultadosWaterfallStep = {
  id: ResultadosWaterfallStepId;
  labelKey: string;
  value: number;
  kind: ResultadosWaterfallKind;
};

export type ResultadosWaterfallModel = {
  ingreso: number;
  costo: number;
  utilidadBruta: number;
  gasto: number;
  resultadoOperativo: number;
  da: number;
  ebitda: number;
  steps: ResultadosWaterfallStep[];
};

export type ResultadosWaterfallRow = {
  id: ResultadosWaterfallStep["id"];
  labelKey: string;
  kind: ResultadosWaterfallKind;
  value: number;
  base: number;
  amount: number;
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function buildResultadosWaterfall(
  totals: DestacadosPeriodTotals,
): ResultadosWaterfallModel | null {
  const ingreso = totals.ingreso_total;
  const costo = totals.costo_total;
  const gasto = totals.gasto_total;
  const ebitda = totals.ebitda;
  const da = totals.depreciacion_amortizacion ?? 0;

  if (
    !isFiniteNumber(ingreso) ||
    !isFiniteNumber(costo) ||
    !isFiniteNumber(gasto) ||
    !isFiniteNumber(ebitda) ||
    !isFiniteNumber(da)
  ) {
    return null;
  }

  const utilidadBruta = ingreso - costo;
  const resultadoOperativo = ingreso - costo - gasto;
  const includeDa = da > MONEY_TOLERANCE;

  const steps: ResultadosWaterfallStep[] = [
    { id: "income", labelKey: "resultados.step.income", value: ingreso, kind: "total" },
    { id: "costs", labelKey: "resultados.step.costs", value: costo, kind: "decrease" },
    {
      id: "grossProfit",
      labelKey: "resultados.step.grossProfit",
      value: utilidadBruta,
      kind: "subtotal",
    },
    { id: "expenses", labelKey: "resultados.step.expenses", value: gasto, kind: "decrease" },
  ];

  if (includeDa) {
    steps.push({
      id: "operatingResult",
      labelKey: "resultados.step.operatingResult",
      value: resultadoOperativo,
      kind: "subtotal",
    });
    steps.push({
      id: "da",
      labelKey: "resultados.step.da",
      value: da,
      kind: "increase",
    });
  }

  steps.push({
    id: "ebitda",
    labelKey: "resultados.step.ebitda",
    value: ebitda,
    kind: "subtotal",
  });

  return {
    ingreso,
    costo,
    utilidadBruta,
    gasto,
    resultadoOperativo,
    da,
    ebitda,
    steps,
  };
}

export function toWaterfallRows(model: ResultadosWaterfallModel): ResultadosWaterfallRow[] {
  const rows: ResultadosWaterfallRow[] = [];
  let running = 0;

  for (const step of model.steps) {
    if (step.kind === "decrease") {
      const base = running - step.value;
      running -= step.value;
      rows.push({
        id: step.id,
        labelKey: step.labelKey,
        kind: step.kind,
        value: step.value,
        base,
        amount: step.value,
      });
      continue;
    }

    if (step.kind === "increase") {
      const base = running;
      running += step.value;
      rows.push({
        id: step.id,
        labelKey: step.labelKey,
        kind: step.kind,
        value: step.value,
        base,
        amount: step.value,
      });
      continue;
    }

    const base = Math.min(0, step.value);
    running = step.value;
    rows.push({
      id: step.id,
      labelKey: step.labelKey,
      kind: step.kind,
      value: step.value,
      base,
      amount: Math.abs(step.value),
    });
  }

  return rows;
}

export function pctOfIncome(value: number, ingresoTotal: number): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(ingresoTotal) || ingresoTotal === 0) {
    return null;
  }
  return (value / ingresoTotal) * 100;
}
