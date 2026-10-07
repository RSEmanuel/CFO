import { statementNodeValue } from "@/lib/posicion-financiera/statementNodes";
import type { StatementNode } from "@/services/posicionFinanciera";

export const ER_WATERFALL_NODE_IDS = {
  ingresos: "pyg:ingresos",
  costos: "pyg:costos",
  utilidadBruta: "pyg:ub",
  opex: "pyg:gastos-op",
  ebit: "pyg:ebit",
  da: "pyg:da",
  financieros: "pyg:fin",
  impuestos: "pyg:tax",
  utilidadNeta: "pyg:un",
} as const;

export type ErWaterfallKind = "increase" | "decrease" | "subtotal" | "total";

export type ErWaterfallStepId = keyof typeof ER_WATERFALL_NODE_IDS;

export type ErWaterfallInput = Record<ErWaterfallStepId, number | null>;

export type ErWaterfallStep = {
  id: ErWaterfallStepId;
  labelKey: string;
  value: number;
  kind: ErWaterfallKind;
};

export type ErWaterfallModel = ErWaterfallInput & {
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

const STEP_ORDER: ErWaterfallStepId[] = [
  "ingresos",
  "costos",
  "utilidadBruta",
  "opex",
  "ebit",
  "da",
  "financieros",
  "impuestos",
  "utilidadNeta",
];

const STEP_KIND: Record<ErWaterfallStepId, ErWaterfallKind> = {
  ingresos: "increase",
  costos: "decrease",
  utilidadBruta: "subtotal",
  opex: "decrease",
  ebit: "subtotal",
  da: "decrease",
  financieros: "decrease",
  impuestos: "decrease",
  utilidadNeta: "total",
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function extractErWaterfallInput(
  nodes: StatementNode[],
  yearKey: string,
): ErWaterfallInput | null {
  const input = {} as ErWaterfallInput;
  let any = false;
  for (const id of STEP_ORDER) {
    const value = statementNodeValue(nodes, ER_WATERFALL_NODE_IDS[id], yearKey);
    input[id] = value;
    if (value != null) {
      any = true;
    }
  }
  return any ? input : null;
}

export function buildErWaterfall(input: ErWaterfallInput): ErWaterfallModel | null {
  for (const value of Object.values(input)) {
    if (value != null && !isFiniteNumber(value)) {
      return null;
    }
  }

  const steps: ErWaterfallStep[] = [];
  for (const id of STEP_ORDER) {
    const value = input[id];
    if (value == null) {
      continue;
    }
    steps.push({
      id,
      labelKey: `posicionFinanciera.waterfall.steps.${id}`,
      value,
      kind: STEP_KIND[id],
    });
  }

  if (steps.length === 0) {
    return null;
  }

  return { ...input, steps };
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
