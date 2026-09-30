import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectFromPoints } from "./budgetProjection";
import { applyBudgetDrivers, DEFAULT_BUDGET_DRIVERS, type BudgetDrivers } from "./drivers";
import type { MonthlyPnlPoint } from "./types";

function history(): MonthlyPnlPoint[] {
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(2024, index, 1);
    const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const ingreso = 100_000 + (index % 12) * 2_000;
    const costo = 45_000 + (index % 3) * 1_000;
    const gasto = 20_000;
    return {
      periodo,
      ingreso,
      costo,
      gasto,
      ebitda: ingreso - costo - gasto,
      officialIngreso: 0,
      officialCosto: 0,
      officialGasto: 0,
    };
  });
}

const DRIVERS: BudgetDrivers = {
  salesGrowthPct: 10,
  inflationPct: 5,
  headcount: 4,
  headcountCostMonthly: 1_000,
  debtInterestMonthly: 2_500,
  depreciationMonthly: 3_000,
};

describe("drivers de proyección", () => {
  it("con drivers en cero la proyección no cambia", () => {
    const base = projectFromPoints(history(), undefined, false, "2025-12");
    const adjusted = applyBudgetDrivers(base, DEFAULT_BUDGET_DRIVERS);
    assert.deepEqual(adjusted.rubros.ingreso.months, base.rubros.ingreso.months);
    assert.deepEqual(adjusted.rubros.gasto.months, base.rubros.gasto.months);
  });

  it("crecimiento e inflación escalan ingreso, costo y gasto; headcount suma al gasto", () => {
    const base = projectFromPoints(history(), undefined, false, "2025-12");
    const adjusted = applyBudgetDrivers(base, DRIVERS);
    const index = 0;
    const ingresoBase = base.rubros.ingreso.months[index].p50;
    const costoBase = base.rubros.costo.months[index].p50;
    const gastoBase = base.rubros.gasto.months[index].p50;
    assert.equal(adjusted.rubros.ingreso.months[index].p50, Math.round(ingresoBase * 1.1 * 100) / 100);
    assert.equal(adjusted.rubros.costo.months[index].p50, Math.round(costoBase * 1.05 * 100) / 100);
    assert.equal(
      adjusted.rubros.gasto.months[index].p50,
      Math.round((gastoBase * 1.05 + 4_000) * 100) / 100,
    );
  });

  it("mantiene la identidad EBITDA = ingreso - costo - gasto en p50", () => {
    const base = projectFromPoints(history(), undefined, false, "2025-12");
    const adjusted = applyBudgetDrivers(base, DRIVERS);
    for (let index = 0; index < adjusted.rubros.ebitda.months.length; index += 1) {
      const month = adjusted.rubros.ebitda.months[index];
      const expected =
        adjusted.rubros.ingreso.months[index].p50 -
        adjusted.rubros.costo.months[index].p50 -
        adjusted.rubros.gasto.months[index].p50;
      assert.ok(Math.abs(month.p50 - expected) < 0.02);
      assert.ok(month.p20 <= month.p50 && month.p50 <= month.p80);
    }
  });

  it("escala los escenarios sin romper la identidad", () => {
    const base = projectFromPoints(history(), undefined, false, "2025-12");
    const adjusted = applyBudgetDrivers(base, DRIVERS);
    for (const scenario of ["base", "upside", "downside"] as const) {
      for (const month of adjusted.scenarios[scenario]) {
        const expected = month.ingreso - month.costo - month.gasto;
        assert.ok(Math.abs(month.ebitda - expected) < 0.02);
      }
    }
  });
});
