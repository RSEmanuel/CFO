import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DestacadosPeriodTotals } from "@/services/financialDataTransformer";
import {
  buildResultadosWaterfall,
  pctOfIncome,
  toWaterfallRows,
} from "./resultadosWaterfall";

function totals(overrides: Partial<DestacadosPeriodTotals> = {}): DestacadosPeriodTotals {
  return {
    ingreso_total: 1_000,
    costo_total: 400,
    gasto_total: 200,
    ebitda: 400,
    depreciacion_amortizacion: 0,
    micro_categorias: {},
    desglose_ingreso: {},
    desglose_costo: {},
    desglose_gasto: {},
    ...overrides,
  };
}

describe("buildResultadosWaterfall", () => {
  it("sin D&A devuelve 5 pasos en orden", () => {
    const model = buildResultadosWaterfall(totals());
    assert.ok(model);
    assert.equal(model.steps.length, 5);
    assert.deepEqual(
      model.steps.map((step) => [step.id, step.kind]),
      [
        ["income", "total"],
        ["costs", "decrease"],
        ["grossProfit", "subtotal"],
        ["expenses", "decrease"],
        ["ebitda", "subtotal"],
      ],
    );
    assert.ok(model.steps.every((step) => step.labelKey.startsWith("resultados.step.")));
  });

  it("con D&A incluye Resultado op. y D&A y usa el EBITDA del motor", () => {
    const model = buildResultadosWaterfall(
      totals({
        gasto_total: 250,
        ebitda: 400,
        depreciacion_amortizacion: 50,
      }),
    );
    assert.ok(model);
    assert.deepEqual(
      model.steps.map((step) => [step.id, step.kind, step.value]),
      [
        ["income", "total", 1_000],
        ["costs", "decrease", 400],
        ["grossProfit", "subtotal", 600],
        ["expenses", "decrease", 250],
        ["operatingResult", "subtotal", 350],
        ["da", "increase", 50],
        ["ebitda", "subtotal", 400],
      ],
    );
  });

  it("Utilidad Bruta = Ingreso - Costos", () => {
    const model = buildResultadosWaterfall(totals());
    assert.ok(model);
    const gross = model.steps.find((step) => step.id === "grossProfit");
    assert.equal(gross?.value, 600);
  });

  it("pinta aunque EBITDA no concilie con Ingreso - Costos - Gastos", () => {
    const model = buildResultadosWaterfall(totals({ ebitda: 999 }));
    assert.ok(model);
    assert.equal(model.steps.find((step) => step.id === "ebitda")?.value, 999);
  });

  it("devuelve null con valores no finitos", () => {
    assert.equal(buildResultadosWaterfall(totals({ ingreso_total: Number.NaN })), null);
  });

  it("con totales en cero no lanza y devuelve pasos en 0", () => {
    const model = buildResultadosWaterfall(
      totals({ ingreso_total: 0, costo_total: 0, gasto_total: 0, ebitda: 0 }),
    );
    assert.ok(model);
    assert.equal(model.steps.length, 5);
    assert.ok(model.steps.every((step) => step.value === 0));
  });
});

describe("toWaterfallRows", () => {
  it("calcula la base flotante sin D&A", () => {
    const model = buildResultadosWaterfall(totals());
    assert.ok(model);
    const rows = toWaterfallRows(model);
    assert.deepEqual(
      rows.map((row) => [row.id, row.base, row.amount]),
      [
        ["income", 0, 1_000],
        ["costs", 600, 400],
        ["grossProfit", 0, 600],
        ["expenses", 400, 200],
        ["ebitda", 0, 400],
      ],
    );
  });

  it("D&A se apila como increase sobre el resultado operativo", () => {
    const model = buildResultadosWaterfall(
      totals({
        gasto_total: 250,
        ebitda: 400,
        depreciacion_amortizacion: 50,
      }),
    );
    assert.ok(model);
    const rows = toWaterfallRows(model);
    assert.deepEqual(
      rows.map((row) => [row.id, row.base, row.amount]),
      [
        ["income", 0, 1_000],
        ["costs", 600, 400],
        ["grossProfit", 0, 600],
        ["expenses", 350, 250],
        ["operatingResult", 0, 350],
        ["da", 350, 50],
        ["ebitda", 0, 400],
      ],
    );
  });
});

describe("pctOfIncome", () => {
  it("calcula el % sobre el ingreso total", () => {
    assert.equal(pctOfIncome(400, 1_000), 40);
    assert.equal(pctOfIncome(600, 1_000), 60);
  });

  it("devuelve null si el ingreso es cero o no finito", () => {
    assert.equal(pctOfIncome(100, 0), null);
    assert.equal(pctOfIncome(100, Number.NaN), null);
  });
});
