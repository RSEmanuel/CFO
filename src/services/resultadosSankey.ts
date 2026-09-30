import type { DestacadosPeriodTotals } from "@/services/financialDataTransformer";
import { MONEY_TOLERANCE, nearlyEqual, round2 } from "@/services/money";

export type SankeyFamily = "ingreso" | "rentabilidad" | "costo" | "gasto" | "otra";

export type SankeyLimits = {
  income: number;
  costs: number;
  expenses: number;
};

export const DEFAULT_SANKEY_LIMITS: SankeyLimits = {
  income: 6,
  costs: 8,
  expenses: 8,
};

export type SankeyNode = {
  name: string;
  depth: number;
  sortRank: number;
  family: SankeyFamily;
  value: number;
  color: string;
  labelSide: "left" | "right";
  labelKey?: string;
  groupedCount?: number;
  groupedItems?: Array<{ name: string; value: number }>;
};

export type SankeyLink = { source: string; target: string; value: number };

export type SankeyGraph = {
  nodes: SankeyNode[];
  links: SankeyLink[];
};

export function sankeyChartHeight(graph: SankeyGraph): number {
  const nodesByDepth = new Map<number, number>();
  for (const node of graph.nodes) {
    nodesByDepth.set(node.depth, (nodesByDepth.get(node.depth) ?? 0) + 1);
  }
  const largestColumn = Math.max(0, ...nodesByDepth.values());
  return Math.min(760, Math.max(560, largestColumn * 45));
}

export const SANKEY_IDS = {
  income: "hub.income",
  costs: "hub.costs",
  expenses: "hub.expenses",
  grossProfit: "hub.grossProfit",
  ebitda: "hub.ebitda",
  otherIncome: "other.income",
  otherCosts: "other.costs",
  otherExpenses: "other.expenses",
} as const;

export const SANKEY_LABEL_KEYS: Record<string, string> = {
  [SANKEY_IDS.income]: "resultados.sankey.income",
  [SANKEY_IDS.costs]: "resultados.sankey.costs",
  [SANKEY_IDS.expenses]: "resultados.sankey.expenses",
  [SANKEY_IDS.grossProfit]: "resultados.sankey.grossProfit",
  [SANKEY_IDS.ebitda]: "resultados.sankey.ebitda",
  [SANKEY_IDS.otherIncome]: "resultados.sankey.otherIncome",
  [SANKEY_IDS.otherCosts]: "resultados.sankey.otherCosts",
  [SANKEY_IDS.otherExpenses]: "resultados.sankey.otherExpenses",
};

const PROFIT_COLORS: Record<string, string> = {
  [SANKEY_IDS.grossProfit]: "#78917A",
  [SANKEY_IDS.ebitda]: "#638066",
};

type Item = { name: string; value: number };

type AggregatedFamily = {
  items: Record<string, number>;
  grouped?: {
    count: number;
    items: Item[];
  };
};

function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (left, right) =>
      Math.abs(right.value) - Math.abs(left.value) ||
      left.name.localeCompare(right.name),
  );
}

function assertVisibleLimit(maxVisible: number): void {
  if (!Number.isInteger(maxVisible) || maxVisible < 0) {
    throw new Error("El límite visible del Sankey debe ser un entero mayor o igual a cero.");
  }
}

export function aggregateTopItems(
  items: Record<string, number>,
  maxVisible: number,
  otherLabel: string,
): Record<string, number> {
  assertVisibleLimit(maxVisible);
  const positive = sortItems(
    Object.entries(items)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([name, value]) => ({ name, value: round2(value) })),
  );
  const visible = positive.slice(0, maxVisible);
  const grouped = positive.slice(maxVisible);
  const result: Record<string, number> = Object.fromEntries(
    visible.map((item) => [item.name, item.value]),
  );
  if (grouped.length > 0) {
    const otherValue = round2(grouped.reduce((sum, item) => sum + item.value, 0));
    if (otherValue > 0) {
      result[otherLabel] = otherValue;
    }
  }

  const originalTotal = round2(positive.reduce((sum, item) => sum + item.value, 0));
  const resultTotal = round2(Object.values(result).reduce((sum, value) => sum + value, 0));
  if (!nearlyEqual(originalTotal, resultTotal)) {
    throw new Error(
      `La agrupación ${otherLabel} no conserva importes: original=${originalTotal.toFixed(2)} resultado=${resultTotal.toFixed(2)}.`,
    );
  }
  return result;
}

function aggregateFamily(
  source: Record<string, number>,
  maxVisible: number,
  otherLabel: string,
  expectedTotal: number,
): AggregatedFamily {
  assertVisibleLimit(maxVisible);
  const allItems = sortItems(
    Object.entries(source)
      .filter(([, value]) => Number.isFinite(value) && value !== 0)
      .map(([name, value]) => ({ name, value: round2(value) })),
  );
  const sourceTotal = round2(allItems.reduce((sum, item) => sum + item.value, 0));
  if (!nearlyEqual(sourceTotal, round2(expectedTotal))) {
    throw new Error(
      `${otherLabel} no concilia con su total: cuentas=${sourceTotal.toFixed(2)} total=${round2(expectedTotal).toFixed(2)}.`,
    );
  }

  const positive = sortItems(allItems.filter((item) => item.value > 0));
  const contra = allItems.filter((item) => item.value < 0);
  const visible = positive.slice(0, maxVisible);
  const grouped = [...positive.slice(maxVisible), ...contra];

  while (
    grouped.length > 0 &&
    round2(grouped.reduce((sum, item) => sum + item.value, 0)) <= 0 &&
    visible.length > 0
  ) {
    grouped.push(visible.pop()!);
  }

  const result: Record<string, number> = Object.fromEntries(
    visible.map((item) => [item.name, item.value]),
  );
  if (grouped.length > 0) {
    const visibleTotal = round2(visible.reduce((sum, item) => sum + item.value, 0));
    const otherValue = round2(expectedTotal - visibleTotal);
    if (otherValue <= 0) {
      throw new Error(
        `${otherLabel} queda en ${otherValue.toFixed(2)} después de netear contracuentas; ECharts Sankey requiere links positivos.`,
      );
    }
    result[otherLabel] = otherValue;
  }

  const resultTotal = round2(Object.values(result).reduce((sum, value) => sum + value, 0));
  if (!nearlyEqual(resultTotal, round2(expectedTotal), MONEY_TOLERANCE)) {
    throw new Error(
      `${otherLabel} no conserva el total reconciliado: resultado=${resultTotal.toFixed(2)} total=${round2(expectedTotal).toFixed(2)}.`,
    );
  }

  return {
    items: result,
    grouped:
      grouped.length > 0
        ? {
            count: grouped.length,
            items: sortItems(grouped).slice(0, 5),
          }
        : undefined,
  };
}

export function sankeyNodeColor(id: string, family: SankeyFamily = "otra"): string {
  if (family === "ingreso" || id === SANKEY_IDS.income) {
    return "#C45D3E";
  }
  if (PROFIT_COLORS[id]) {
    return PROFIT_COLORS[id];
  }
  if (family === "costo" || id === SANKEY_IDS.costs) {
    return "#9F1239";
  }
  if (family === "gasto" || id === SANKEY_IDS.expenses) {
    return "#B08442";
  }
  return "#6B6459";
}

/**
 * Columnas fijas: cada padre queda a la izquierda de sus hijos.
 * No hay “else → última columna”: un nodo sin regla falla.
 */
export function sankeyNodeDepth(name: string, family: SankeyFamily): number {
  if (name === SANKEY_IDS.income) {
    return 1;
  }
  if (name === SANKEY_IDS.grossProfit || name === SANKEY_IDS.costs) {
    return 2;
  }
  if (name === SANKEY_IDS.ebitda || name === SANKEY_IDS.expenses) {
    return 3;
  }
  if (family === "ingreso") {
    return 0;
  }
  if (family === "costo") {
    return 3;
  }
  if (family === "gasto") {
    return 4;
  }
  throw new Error(`Nodo Sankey sin columna canónica: name=${name} family=${family}`);
}

function orderedFamilyAccounts(items: Record<string, number>, otherLabel: string): Item[] {
  const otherValue = items[otherLabel];
  const rest = sortItems(
    Object.entries(items)
      .filter(([name]) => name !== otherLabel)
      .map(([name, value]) => ({ name, value })),
  );
  return otherValue != null ? [...rest, { name: otherLabel, value: otherValue }] : rest;
}

function compareNodes(left: SankeyNode, right: SankeyNode): number {
  return left.depth - right.depth || left.sortRank - right.sortRank || left.name.localeCompare(right.name);
}

export function generateSankeyData(
  totals: DestacadosPeriodTotals,
  limits: SankeyLimits = DEFAULT_SANKEY_LIMITS,
): SankeyGraph {
  const income = aggregateFamily(
    totals.desglose_ingreso,
    limits.income,
    SANKEY_IDS.otherIncome,
    totals.ingreso_total,
  );
  const costs = aggregateFamily(
    totals.desglose_costo,
    limits.costs,
    SANKEY_IDS.otherCosts,
    totals.costo_total,
  );
  const expenses = aggregateFamily(
    totals.desglose_gasto,
    limits.expenses,
    SANKEY_IDS.otherExpenses,
    totals.gasto_total,
  );

  const incomeAccounts = orderedFamilyAccounts(income.items, SANKEY_IDS.otherIncome);
  const costAccounts = orderedFamilyAccounts(costs.items, SANKEY_IDS.otherCosts);
  const expenseAccounts = orderedFamilyAccounts(expenses.items, SANKEY_IDS.otherExpenses);

  const families = new Map<string, SankeyFamily>([
    [SANKEY_IDS.income, "ingreso"],
    [SANKEY_IDS.costs, "costo"],
    [SANKEY_IDS.expenses, "gasto"],
    [SANKEY_IDS.grossProfit, "rentabilidad"],
    [SANKEY_IDS.ebitda, "rentabilidad"],
  ]);
  for (const item of incomeAccounts) {
    families.set(item.name, "ingreso");
  }
  for (const item of costAccounts) {
    families.set(item.name, "costo");
  }
  for (const item of expenseAccounts) {
    families.set(item.name, "gasto");
  }

  const groupedByName = new Map<string, AggregatedFamily["grouped"]>([
    [SANKEY_IDS.otherIncome, income.grouped],
    [SANKEY_IDS.otherCosts, costs.grouped],
    [SANKEY_IDS.otherExpenses, expenses.grouped],
  ]);

  const sortRankByName = new Map<string, number>([
    [SANKEY_IDS.income, 0],
    [SANKEY_IDS.grossProfit, 0],
    [SANKEY_IDS.costs, 1],
    [SANKEY_IDS.ebitda, 0],
    [SANKEY_IDS.expenses, 1],
  ]);
  incomeAccounts.forEach((item, index) => sortRankByName.set(item.name, index));
  // Hijos de Costos debajo de EBITDA y Gastos: siguen el padre "Costos" (abajo en depth 2).
  costAccounts.forEach((item, index) => sortRankByName.set(item.name, 2 + index));
  expenseAccounts.forEach((item, index) => sortRankByName.set(item.name, index));

  const links: SankeyLink[] = [];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();

  const addLink = (source: string, target: string, value: number) => {
    if (value <= 0) {
      return;
    }
    links.push({ source, target, value });
    outgoing.set(source, (outgoing.get(source) ?? 0) + value);
    incoming.set(target, (incoming.get(target) ?? 0) + value);
  };

  for (const item of incomeAccounts) {
    addLink(item.name, SANKEY_IDS.income, item.value);
  }

  const utilidadBruta = totals.ingreso_total - totals.costo_total;
  addLink(SANKEY_IDS.income, SANKEY_IDS.grossProfit, utilidadBruta);
  addLink(SANKEY_IDS.income, SANKEY_IDS.costs, totals.costo_total);

  for (const item of costAccounts) {
    addLink(SANKEY_IDS.costs, item.name, item.value);
  }

  addLink(SANKEY_IDS.grossProfit, SANKEY_IDS.ebitda, totals.ebitda);
  addLink(SANKEY_IDS.grossProfit, SANKEY_IDS.expenses, totals.gasto_total);

  for (const item of expenseAccounts) {
    addLink(SANKEY_IDS.expenses, item.name, item.value);
  }

  const names = [
    ...incomeAccounts.map((item) => item.name),
    SANKEY_IDS.income,
    SANKEY_IDS.grossProfit,
    SANKEY_IDS.costs,
    SANKEY_IDS.ebitda,
    SANKEY_IDS.expenses,
    ...costAccounts.map((item) => item.name),
    ...expenseAccounts.map((item) => item.name),
  ];
  const nodes: SankeyNode[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const inflow = incoming.get(name);
    const outflow = outgoing.get(name);
    if (inflow == null && outflow == null) {
      continue;
    }
    const family = families.get(name);
    if (family == null) {
      throw new Error(`Nodo Sankey sin familia: ${name}`);
    }
    const depth = sankeyNodeDepth(name, family);
    const grouped = groupedByName.get(name);
    nodes.push({
      name,
      labelKey: SANKEY_LABEL_KEYS[name],
      depth,
      sortRank: sortRankByName.get(name) ?? 0,
      family,
      value: round2(inflow ?? outflow ?? 0),
      color: sankeyNodeColor(name, family),
      labelSide: depth === 0 ? "left" : "right",
      groupedCount: grouped?.count,
      groupedItems: grouped?.items,
    });
  }

  nodes.sort(compareNodes);
  const nodeByName = new Map(nodes.map((node) => [node.name, node]));
  links.sort((left, right) => {
    const leftSource = nodeByName.get(left.source);
    const rightSource = nodeByName.get(right.source);
    const leftTarget = nodeByName.get(left.target);
    const rightTarget = nodeByName.get(right.target);
    if (!leftSource || !rightSource || !leftTarget || !rightTarget) {
      return left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
    }
    return (
      leftSource.depth - rightSource.depth ||
      leftTarget.sortRank - rightTarget.sortRank ||
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target)
    );
  });

  return { nodes, links };
}
