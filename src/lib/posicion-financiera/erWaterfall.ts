import { statementNodeValue } from "@/lib/posicion-financiera/statementNodes";
import { round2 } from "@/services/money";
import type { StatementNode } from "@/services/posicionFinanciera";

export const ER_WATERFALL_NODE_IDS = {
  ingresos: "pyg:ingresos",
  costos: "pyg:costos",
  utilidadBruta: "pyg:ub",
  opex: "pyg:gastos-op",
  utilidadNeta: "pyg:un",
} as const;

export type ErWaterfallKind = "increase" | "decrease" | "subtotal" | "total";

export type ErWaterfallStepId = "ingresos" | "costos" | "utilidadBruta" | "opex" | "utilidadNeta";

export type ErWaterfallInput = {
  ingresos: number;
  costos: number;
  utilidadBruta: number;
  opex: number;
  utilidadNeta: number;
};

export type ErWaterfallStep = {
  id: ErWaterfallStepId;
  labelKey: string;
  value: number;
  kind: ErWaterfallKind;
};

export type ErWaterfallModel = ErWaterfallInput & {
  /** neta − (bruta − opex): D&A, financiero, impuestos y demás partidas del ER. */
  otherItems: number;
  steps: ErWaterfallStep[];
};

export type ErWaterfallRow = {
  id: ErWaterfallStepId;
  labelKey: string;
  kind: ErWaterfallKind;
  value: number;
  base: number;
  amount: number;
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function extractErWaterfallInput(
  nodes: StatementNode[],
  yearKey: string,
): ErWaterfallInput | null {
  const ingresos = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS.ingresos, yearKey);
  const costos = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS.costos, yearKey);
  const utilidadBruta = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS.utilidadBruta, yearKey);
  const opex = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS.opex, yearKey);
  const utilidadNeta = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS.utilidadNeta, yearKey);
  if (
    ingresos == null ||
    costos == null ||
    utilidadBruta == null ||
    opex == null ||
    utilidadNeta == null
  ) {
    return null;
  }
  return { ingresos, costos, utilidadBruta, opex, utilidadNeta };
}

export function buildErWaterfall(input: ErWaterfallInput): ErWaterfallModel | null {
  const { ingresos, costos, utilidadBruta, opex, utilidadNeta } = input;
  if (
    !isFiniteNumber(ingresos) ||
    !isFiniteNumber(costos) ||
    !isFiniteNumber(utilidadBruta) ||
    !isFiniteNumber(opex) ||
    !isFiniteNumber(utilidadNeta)
  ) {
    return null;
  }

  const otherItems = round2(utilidadNeta - (utilidadBruta - opex));
  const steps: ErWaterfallStep[] = [
    {
      id: "ingresos",
      labelKey: "posicionFinanciera.waterfall.steps.ingresos",
      value: ingresos,
      kind: "increase",
    },
    {
      id: "costos",
      labelKey: "posicionFinanciera.waterfall.steps.costos",
      value: costos,
      kind: "decrease",
    },
    {
      id: "utilidadBruta",
      labelKey: "posicionFinanciera.waterfall.steps.utilidadBruta",
      value: utilidadBruta,
      kind: "subtotal",
    },
    {
      id: "opex",
      labelKey: "posicionFinanciera.waterfall.steps.opex",
      value: opex,
      kind: "decrease",
    },
    {
      id: "utilidadNeta",
      labelKey: "posicionFinanciera.waterfall.steps.utilidadNeta",
      value: utilidadNeta,
      kind: "total",
    },
  ];

  return { ingresos, costos, utilidadBruta, opex, utilidadNeta, otherItems, steps };
}

export function toErWaterfallRows(model: ErWaterfallModel): ErWaterfallRow[] {
  const rows: ErWaterfallRow[] = [];
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
