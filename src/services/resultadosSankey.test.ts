import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DestacadosPeriodTotals } from "./financialDataTransformer";
import {
  SANKEY_IDS,
  aggregateTopItems,
  generateSankeyData,
  sankeyChartHeight,
  type SankeyGraph,
  type SankeyLimits,
} from "./resultadosSankey";
import { MONEY_TOLERANCE, round2 } from "./money";

function numberedItems(prefix: string, count: number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${prefix} ${String(index + 1).padStart(2, "0")}`,
      index + 1,
    ]),
  );
}

function sum(items: Record<string, number>): number {
  return round2(Object.values(items).reduce((total, value) => total + value, 0));
}

function totals(overrides: Partial<DestacadosPeriodTotals> = {}): DestacadosPeriodTotals {
  return {
    ingreso_total: 1_000,
    costo_total: 200,
    gasto_total: 300,
    ebitda: 500,
    depreciacion_amortizacion: 0,
    micro_categorias: {},
    desglose_ingreso: { "Ingreso A": 600, "Ingreso B": 400 },
    desglose_costo: { "Costo A": 120, "Costo B": 80 },
    desglose_gasto: { "Gasto A": 150, "Gasto B": 100, "Gasto C": 50 },
    ...overrides,
  };
}

function branchTotal(graph: SankeyGraph, family: "income" | "costs" | "expenses"): number {
  const links =
    family === "income"
      ? graph.links.filter((link) => link.target === SANKEY_IDS.income)
      : family === "costs"
        ? graph.links.filter((link) => link.source === SANKEY_IDS.costs)
        : graph.links.filter((link) => link.source === SANKEY_IDS.expenses);
  return round2(links.reduce((total, link) => total + link.value, 0));
}

describe("aggregateTopItems", () => {
  it("30 gastos producen 8 visibles y Otros con la suma exacta de los 22 restantes", () => {
    const result = aggregateTopItems(numberedItems("Gasto", 30), 8, "Otros gastos");

    assert.equal(Object.keys(result).length, 9);
    assert.equal(result["Otros gastos"], 253);
    assert.deepEqual(Object.keys(result).slice(0, 3), ["Gasto 30", "Gasto 29", "Gasto 28"]);
  });

  it("5 gastos con límite 8 no producen Otros", () => {
    const result = aggregateTopItems(numberedItems("Gasto", 5), 8, "Otros gastos");

    assert.equal(Object.keys(result).length, 5);
    assert.equal(result["Otros gastos"], undefined);
  });

  it("elimina ceros y negativos sin crear importes inválidos", () => {
    const result = aggregateTopItems(
      { Positivo: 50, Cero: 0, Negativo: -10 },
      8,
      "Otros gastos",
    );

    assert.deepEqual(result, { Positivo: 50 });
    assert.ok(Object.values(result).every((value) => value > 0));
  });

  it("resuelve empates alfabéticamente y conserva la suma positiva", () => {
    const input = { Zebra: 10, Alfa: 10, Beta: 10, Grande: 20, Cero: 0 };
    const result = aggregateTopItems(input, 2, "Otros");

    assert.deepEqual(Object.keys(result), ["Grande", "Alfa", "Otros"]);
    assert.ok(Math.abs(sum(result) - 50) <= MONEY_TOLERANCE);
    assert.equal(result.Otros, 20);
  });
});

describe("generateSankeyData", () => {
  it("nettea contracuentas dentro de Otros y conserva el total de la rama", () => {
    const graph = generateSankeyData(
      totals({
        gasto_total: 100,
        desglose_gasto: { Principal: 120, Contracuenta: -20, Cero: 0 },
      }),
      { income: 8, costs: 8, expenses: 8 },
    );
    const other = graph.nodes.find((node) => node.name === SANKEY_IDS.otherExpenses);

    assert.ok(other);
    assert.equal(other.value, 100);
    assert.equal(other.groupedCount, 2);
    assert.equal(other.groupedItems?.length, 2);
    assert.equal(branchTotal(graph, "expenses"), 100);
    assert.ok(graph.links.every((link) => link.value > 0));
  });

  it("limita metadatos de Otros a las cinco cuentas más importantes", () => {
    const expenses = numberedItems("Gasto", 30);
    const graph = generateSankeyData(
      totals({ gasto_total: sum(expenses), desglose_gasto: expenses }),
      { income: 8, costs: 8, expenses: 8 },
    );
    const other = graph.nodes.find((node) => node.name === SANKEY_IDS.otherExpenses);

    assert.equal(other?.groupedCount, 22);
    assert.equal(other?.groupedItems?.length, 5);
    assert.deepEqual(
      other?.groupedItems?.map((item) => item.name),
      ["Gasto 22", "Gasto 21", "Gasto 20", "Gasto 19", "Gasto 18"],
    );
  });

  it("Resumen, Estándar y Detallado mantienen totales y EBITDA idénticos", () => {
    const income = numberedItems("Ingreso", 15);
    const costs = numberedItems("Costo", 20);
    const expenses = numberedItems("Gasto", 30);
    const input = totals({
      ingreso_total: sum(income),
      costo_total: sum(costs),
      gasto_total: sum(expenses),
      ebitda: 321.45,
      desglose_ingreso: income,
      desglose_costo: costs,
      desglose_gasto: expenses,
    });
    const levels: SankeyLimits[] = [
      { income: 5, costs: 5, expenses: 5 },
      { income: 8, costs: 8, expenses: 8 },
      { income: 12, costs: 12, expenses: 12 },
    ];

    for (const limits of levels) {
      const graph = generateSankeyData(input, limits);
      assert.equal(branchTotal(graph, "income"), input.ingreso_total);
      assert.equal(branchTotal(graph, "costs"), input.costo_total);
      assert.equal(branchTotal(graph, "expenses"), input.gasto_total);
      assert.equal(graph.nodes.find((node) => node.name === SANKEY_IDS.ebitda)?.value, input.ebitda);
    }
  });

  it("mantiene legible un desglose anónimo del volumen de Compac", () => {
    const expenses: Record<string, number> = {};
    for (let index = 1; index <= 24; index += 1) {
      expenses[`Cuenta positiva ${String(index).padStart(3, "0")}`] = 1_000 + index;
    }
    for (let index = 1; index <= 5; index += 1) {
      expenses[`Contracuenta ${String(index).padStart(3, "0")}`] = -10;
    }
    for (let index = 1; index <= 84; index += 1) {
      expenses[`Cuenta sin movimiento ${String(index).padStart(3, "0")}`] = 0;
    }
    const graph = generateSankeyData(
      totals({ gasto_total: sum(expenses), desglose_gasto: expenses }),
      { income: 8, costs: 8, expenses: 8 },
    );
    const individualExpenses = graph.nodes.filter(
      (node) =>
        node.family === "gasto" &&
        node.name !== SANKEY_IDS.expenses &&
        node.name !== SANKEY_IDS.otherExpenses,
    );
    const other = graph.nodes.find((node) => node.name === SANKEY_IDS.otherExpenses);
    const maxColumnNodes = Math.max(
      ...[0, 1, 2, 3, 4].map(
        (depth) => graph.nodes.filter((node) => node.depth === depth).length,
      ),
    );

    assert.equal(individualExpenses.length, 8);
    assert.equal(other?.groupedCount, 21);
    assert.ok(maxColumnNodes <= 13);
    assert.equal(sankeyChartHeight(graph), Math.max(560, maxColumnNodes * 45));
    assert.ok(sankeyChartHeight(graph) <= 760);
  });

  function childrenOf(graph: SankeyGraph, parent: string): string[] {
    return graph.links.filter((link) => link.source === parent).map((link) => link.target);
  }

  function nodeNamed(graph: SankeyGraph, name: string) {
    const node = graph.nodes.find((item) => item.name === name);
    assert.ok(node, `falta nodo ${name}`);
    return node;
  }

  it("Gastos, Costos e Ingresos quedan en una columna anterior a sus hijos", () => {
    const graph = generateSankeyData(
      totals({
        ingreso_total: 1_000,
        costo_total: 200,
        gasto_total: 300,
        desglose_ingreso: { "Ingreso A": 700, "Ingreso B": 200, Extra: 100 },
        desglose_costo: { "Costo A": 120, "Costo B": 80 },
        desglose_gasto: { "Gasto A": 150, "Gasto B": 100, "Gasto C": 50 },
      }),
    );

    for (const parent of [SANKEY_IDS.income, SANKEY_IDS.costs, SANKEY_IDS.expenses] as const) {
      const parentDepth = nodeNamed(graph, parent).depth;
      for (const child of childrenOf(graph, parent)) {
        assert.ok(
          nodeNamed(graph, child).depth > parentDepth,
          `${parent} depth=${parentDepth} no es menor que ${child}`,
        );
      }
    }
    assert.equal(nodeNamed(graph, SANKEY_IDS.expenses).depth, 3);
    assert.ok(childrenOf(graph, SANKEY_IDS.expenses).every((name) => nodeNamed(graph, name).depth === 4));
  });

  it("dos llamadas con los mismos totales producen el mismo arreglo de nodos", () => {
    const input = totals({
      desglose_ingreso: numberedItems("Ingreso", 10),
      desglose_costo: numberedItems("Costo", 12),
      desglose_gasto: numberedItems("Gasto", 15),
      ingreso_total: sum(numberedItems("Ingreso", 10)),
      costo_total: sum(numberedItems("Costo", 12)),
      gasto_total: sum(numberedItems("Gasto", 15)),
    });
    const first = generateSankeyData(input);
    const second = generateSankeyData(input);
    assert.deepEqual(first.nodes, second.nodes);
    assert.deepEqual(first.links, second.links);
  });

  it("Otros queda al final de su familia en cada columna", () => {
    const income = numberedItems("Ingreso", 10);
    const costs = numberedItems("Costo", 12);
    const expenses = numberedItems("Gasto", 30);
    const graph = generateSankeyData(
      totals({
        ingreso_total: sum(income),
        costo_total: sum(costs),
        gasto_total: sum(expenses),
        desglose_ingreso: income,
        desglose_costo: costs,
        desglose_gasto: expenses,
      }),
      { income: 3, costs: 3, expenses: 3 },
    );

    const lastOfFamily = (family: "ingreso" | "costo" | "gasto", other: string) => {
      const column = graph.nodes.filter((node) => node.family === family && node.name !== (
        family === "ingreso" ? SANKEY_IDS.income : family === "costo" ? SANKEY_IDS.costs : SANKEY_IDS.expenses
      ));
      assert.equal(column.at(-1)?.name, other);
    };

    lastOfFamily("ingreso", SANKEY_IDS.otherIncome);
    lastOfFamily("costo", SANKEY_IDS.otherCosts);
    lastOfFamily("gasto", SANKEY_IDS.otherExpenses);
  });

  it("en depth 3, EBITDA aparece antes que las cuentas de costo", () => {
    const graph = generateSankeyData(totals());
    const depth3 = graph.nodes.filter((node) => node.depth === 3);
    const ebitdaIndex = depth3.findIndex((node) => node.name === SANKEY_IDS.ebitda);
    const firstCostIndex = depth3.findIndex((node) => node.family === "costo" && node.name !== SANKEY_IDS.costs);
    assert.ok(ebitdaIndex >= 0);
    assert.ok(firstCostIndex >= 0);
    assert.ok(ebitdaIndex < firstCostIndex);
    assert.ok(depth3.findIndex((node) => node.name === SANKEY_IDS.expenses) < firstCostIndex);
  });

  it("cambiar el detalle no altera totales ni el orden relativo de nodos estructurales", () => {
    const income = numberedItems("Ingreso", 15);
    const costs = numberedItems("Costo", 20);
    const expenses = numberedItems("Gasto", 30);
    const input = totals({
      ingreso_total: sum(income),
      costo_total: sum(costs),
      gasto_total: sum(expenses),
      ebitda: 321.45,
      desglose_ingreso: income,
      desglose_costo: costs,
      desglose_gasto: expenses,
    });
    const structural = [
      SANKEY_IDS.income,
      SANKEY_IDS.grossProfit,
      SANKEY_IDS.costs,
      SANKEY_IDS.ebitda,
      SANKEY_IDS.expenses,
    ];
    const orders: string[][] = [];

    for (const limits of [
      { income: 5, costs: 5, expenses: 5 },
      { income: 8, costs: 8, expenses: 8 },
      { income: 12, costs: 12, expenses: 12 },
    ] satisfies SankeyLimits[]) {
      const graph = generateSankeyData(input, limits);
      assert.equal(branchTotal(graph, "income"), input.ingreso_total);
      assert.equal(branchTotal(graph, "costs"), input.costo_total);
      assert.equal(branchTotal(graph, "expenses"), input.gasto_total);
      assert.equal(graph.nodes.find((node) => node.name === SANKEY_IDS.ebitda)?.value, input.ebitda);
      orders.push(
        graph.nodes.filter((node) => (structural as string[]).includes(node.name)).map((node) => node.name),
      );
    }

    assert.deepEqual(orders[0], orders[1]);
    assert.deepEqual(orders[1], orders[2]);
  });

  it("una sola cuenta por familia llena depths 0-4 y no deja columnas estructurales vacías", () => {
    const graph = generateSankeyData(
      totals({
        ingreso_total: 1_000,
        costo_total: 200,
        gasto_total: 300,
        desglose_ingreso: { "Ingreso único": 1_000 },
        desglose_costo: { "Costo único": 200 },
        desglose_gasto: { "Gasto único": 300 },
      }),
    );

    const depths = [0, 1, 2, 3, 4].map(
      (depth) => graph.nodes.filter((node) => node.depth === depth).map((node) => node.name),
    );
    assert.deepEqual(depths[0], ["Ingreso único"]);
    assert.deepEqual(depths[1], [SANKEY_IDS.income]);
    assert.deepEqual(depths[2], [SANKEY_IDS.grossProfit, SANKEY_IDS.costs]);
    assert.deepEqual(depths[3], [SANKEY_IDS.ebitda, SANKEY_IDS.expenses, "Costo único"]);
    assert.deepEqual(depths[4], ["Gasto único"]);
    assert.ok(graph.nodes.every((node) => node.depth >= 0 && node.depth <= 4));
  });
});
