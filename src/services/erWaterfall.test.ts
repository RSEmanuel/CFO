import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearlyEqual } from "@/services/money";
import type { StatementNode } from "@/services/posicionFinanciera";
import {
  buildErWaterfall,
  extractErWaterfallInput,
  toErWaterfallRows,
  waterfallTone,
  type ErWaterfallInput,
} from "./erWaterfall";

function input(overrides: Partial<ErWaterfallInput> = {}): ErWaterfallInput {
  return {
    ingresos: 4_230_000,
    costos: 1_030_000,
    utilidadBruta: 3_200_000,
    opex: 1_370_000,
    ebit: 1_830_000,
    da: 80_000,
    financieros: 70_000,
    impuestos: 50_000,
    utilidadNeta: 1_630_000,
    ...overrides,
  };
}

function node(id: string, value: number | null): StatementNode {
  return { id, label: id, kind: "total", values: { "2026": value } };
}

describe("extractErWaterfallInput", () => {
  it("lee los nodos del árbol de resultados para el año pedido", () => {
    const extracted = extractErWaterfallInput(
      [
        node("pyg:ingresos", 100),
        node("pyg:costos", 40),
        node("pyg:ub", 60),
        node("pyg:gastos-op", 25),
        node("pyg:ebit", 35),
        node("pyg:da", 4),
        node("pyg:fin", 6),
        node("pyg:tax", 5),
        node("pyg:un", 20),
      ],
      "2026",
    );
    assert.deepEqual(extracted, {
      ingresos: 100,
      costos: 40,
      utilidadBruta: 60,
      opex: 25,
      ebit: 35,
      da: 4,
      financieros: 6,
      impuestos: 5,
      utilidadNeta: 20,
    });
  });

  it("deja en null el paso sin dato y no anula el resto", () => {
    const extracted = extractErWaterfallInput(
      [node("pyg:ingresos", 100), node("pyg:da", null), node("pyg:un", 20)],
      "2026",
    );
    assert.equal(extracted?.ingresos, 100);
    assert.equal(extracted?.da, null);
    assert.equal(extracted?.ebit, null);
    assert.equal(extracted?.utilidadNeta, 20);
  });

  it("devuelve null si no hay ningún nodo con cifra", () => {
    assert.equal(extractErWaterfallInput([node("pyg:ingresos", null)], "2026"), null);
    assert.equal(extractErWaterfallInput([], "2026"), null);
  });
});

describe("buildErWaterfall", () => {
  it("encadena ingresos hasta utilidad neta con D&A, financieros e impuestos", () => {
    const model = buildErWaterfall(input());
    assert.ok(model);
    assert.equal(model.utilidadBruta, (model.ingresos ?? 0) - (model.costos ?? 0));
    assert.equal(model.ebit, (model.utilidadBruta ?? 0) - (model.opex ?? 0));
    assert.ok(
      nearlyEqual(
        model.utilidadNeta ?? 0,
        (model.ebit ?? 0) - (model.da ?? 0) - (model.financieros ?? 0) - (model.impuestos ?? 0),
      ),
    );
    assert.deepEqual(
      model.steps.map((step) => [step.id, step.kind]),
      [
        ["ingresos", "increase"],
        ["costos", "decrease"],
        ["utilidadBruta", "subtotal"],
        ["opex", "decrease"],
        ["ebit", "subtotal"],
        ["da", "decrease"],
        ["financieros", "decrease"],
        ["impuestos", "decrease"],
        ["utilidadNeta", "total"],
      ],
    );
  });

  it("omite un paso sin dato y conserva el orden de los demás", () => {
    const model = buildErWaterfall(input({ da: null, financieros: null }));
    assert.ok(model);
    assert.deepEqual(
      model.steps.map((step) => step.id),
      ["ingresos", "costos", "utilidadBruta", "opex", "ebit", "impuestos", "utilidadNeta"],
    );
  });

  it("ancla la utilidad neta del estado aunque el puente no cuadre", () => {
    const model = buildErWaterfall(input({ utilidadNeta: 999 }));
    assert.ok(model);
    assert.equal(model.steps.find((step) => step.id === "utilidadNeta")?.value, 999);
  });

  it("devuelve null con valores no finitos", () => {
    assert.equal(buildErWaterfall(input({ ingresos: Number.NaN })), null);
  });
});

describe("toErWaterfallRows", () => {
  it("apila cada resta sobre el paso anterior y ancla los subtotales", () => {
    const model = buildErWaterfall(input());
    assert.ok(model);
    const rows = toErWaterfallRows(model);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.equal(byId.ingresos.base, 0);
    assert.equal(byId.ingresos.amount, 4_230_000);
    assert.equal(byId.costos.base, 4_230_000 - 1_030_000);
    assert.equal(byId.utilidadBruta.base, 0);
    assert.equal(byId.utilidadBruta.amount, 3_200_000);
    assert.equal(byId.opex.base, 3_200_000 - 1_370_000);
    assert.equal(byId.ebit.base, 0);
    assert.equal(byId.ebit.amount, 1_830_000);
    assert.equal(byId.da.base, 1_830_000 - 80_000);
    assert.equal(byId.financieros.base, 1_750_000 - 70_000);
    assert.equal(byId.impuestos.base, 1_680_000 - 50_000);
    assert.equal(byId.utilidadNeta.amount, 1_630_000);
    assert.equal(byId.utilidadNeta.base, 0);
  });

  it("si falta D&A, gastos financieros cuelgan del EBIT", () => {
    const model = buildErWaterfall(input({ da: null }));
    assert.ok(model);
    const rows = toErWaterfallRows(model);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.equal(byId.da, undefined);
    assert.equal(byId.financieros.base, 1_830_000 - 70_000);
    assert.equal(byId.impuestos.base, 1_760_000 - 50_000);
  });
});

describe("colores de la cascada", () => {
  it("ingresos en verde, costos y gastos en rojo y utilidad positiva en azul", () => {
    const model = buildErWaterfall(input());
    assert.ok(model);
    const byId = Object.fromEntries(toErWaterfallRows(model).map((row) => [row.id, row]));
    assert.equal(byId.ingresos.tone, "gain");
    assert.equal(byId.costos.tone, "loss");
    assert.equal(byId.opex.tone, "loss");
    assert.equal(byId.utilidadBruta.tone, "profit");
    assert.equal(byId.ebit.tone, "profit");
    assert.equal(byId.utilidadNeta.tone, "profit");
    assert.equal(byId.utilidadNeta.negative, false);
  });

  it("una utilidad neta negativa conserva su signo y se marca en rojo", () => {
    const model = buildErWaterfall(
      input({ ebit: -200_000, utilidadBruta: 1_170_000, opex: 1_370_000, utilidadNeta: -822_604 }),
    );
    assert.ok(model);
    const byId = Object.fromEntries(toErWaterfallRows(model).map((row) => [row.id, row]));
    assert.equal(byId.utilidadNeta.value, -822_604);
    assert.equal(byId.utilidadNeta.negative, true);
    assert.equal(byId.utilidadNeta.tone, "loss");
    assert.equal(byId.utilidadNeta.base, -822_604);
    assert.equal(byId.utilidadNeta.amount, 822_604);
    assert.equal(byId.ebit.value, -200_000);
    assert.equal(byId.ebit.tone, "loss");
    assert.equal(byId.utilidadBruta.tone, "profit");
  });

  it("un paso de resta con monto negativo suma al resultado", () => {
    assert.equal(waterfallTone("decrease", -70_000), "gain");
    assert.equal(waterfallTone("increase", -10), "loss");
    assert.equal(waterfallTone("total", 0), "profit");
  });
});
