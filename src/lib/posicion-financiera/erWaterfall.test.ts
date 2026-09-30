import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearlyEqual } from "@/services/money";
import type { StatementNode } from "@/services/posicionFinanciera";
import {
  buildErWaterfall,
  extractErWaterfallInput,
  toErWaterfallRows,
  type ErWaterfallInput,
} from "./erWaterfall";

function input(overrides: Partial<ErWaterfallInput> = {}): ErWaterfallInput {
  return {
    ingresos: 4_230_000,
    costos: 1_030_000,
    utilidadBruta: 3_200_000,
    opex: 1_370_000,
    utilidadNeta: 1_630_000,
    ...overrides,
  };
}

function node(id: string, value: number): StatementNode {
  return { id, label: id, kind: "total", values: { "2026": value } };
}

describe("extractErWaterfallInput", () => {
  it("lee los 5 nodos del árbol de resultados para el año pedido", () => {
    const extracted = extractErWaterfallInput(
      [
        node("pyg:ingresos", 100),
        node("pyg:costos", 40),
        node("pyg:ub", 60),
        node("pyg:gastos-op", 25),
        node("pyg:un", 20),
      ],
      "2026",
    );
    assert.deepEqual(extracted, {
      ingresos: 100,
      costos: 40,
      utilidadBruta: 60,
      opex: 25,
      utilidadNeta: 20,
    });
  });

  it("devuelve null si falta un nodo", () => {
    assert.equal(extractErWaterfallInput([node("pyg:ingresos", 100)], "2026"), null);
  });
});

describe("buildErWaterfall", () => {
  it("respeta ingresos − costos = bruta y bruta − opex + otras = neta", () => {
    const model = buildErWaterfall(input());
    assert.ok(model);
    assert.equal(model.utilidadBruta, model.ingresos - model.costos);
    assert.ok(nearlyEqual(model.utilidadNeta, model.utilidadBruta - model.opex + model.otherItems));
    assert.equal(model.otherItems, -200_000);
    assert.deepEqual(
      model.steps.map((step) => [step.id, step.kind]),
      [
        ["ingresos", "increase"],
        ["costos", "decrease"],
        ["utilidadBruta", "subtotal"],
        ["opex", "decrease"],
        ["utilidadNeta", "total"],
      ],
    );
  });

  it("usa la neta del estado aunque otras partidas (RIF/fin) no cuadren con EBIT", () => {
    const model = buildErWaterfall(input({ utilidadNeta: 999 }));
    assert.ok(model);
    assert.equal(model.utilidadNeta, 999);
    assert.ok(nearlyEqual(model.otherItems, 999 - (3_200_000 - 1_370_000)));
  });

  it("devuelve null con valores no finitos", () => {
    assert.equal(buildErWaterfall(input({ ingresos: Number.NaN })), null);
  });
});

describe("toErWaterfallRows", () => {
  it("apila base transparente: costos cuelgan de ingresos y el total ancla en neta", () => {
    const model = buildErWaterfall(input());
    assert.ok(model);
    const rows = toErWaterfallRows(model);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.equal(byId.ingresos.base, 0);
    assert.equal(byId.ingresos.amount, 4_230_000);
    assert.equal(byId.costos.base, 4_230_000 - 1_030_000);
    assert.equal(byId.costos.amount, 1_030_000);
    assert.equal(byId.utilidadBruta.base, 0);
    assert.equal(byId.utilidadBruta.amount, 3_200_000);
    assert.equal(byId.opex.base, 3_200_000 - 1_370_000);
    assert.equal(byId.utilidadNeta.amount, 1_630_000);
    assert.equal(byId.utilidadNeta.base, 0);
  });
});
