import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rowToBudgetDrivers } from "./budgetAssumptionService";
import { AUTO_INFLATION_PCT, resolveBudgetDrivers } from "./forecast/drivers";
import type { MonthlyPnlPoint } from "./forecast/types";

const history: MonthlyPnlPoint[] = Array.from({ length: 8 }, (_, index) => ({
  periodo: `2025-${String(index + 1).padStart(2, "0")}`,
  ingreso: 100,
  costo: 40,
  gasto: 20,
  ebitda: 40,
  officialIngreso: 0,
  officialCosto: 0,
  officialGasto: 0,
}));

describe("budgetAssumptionService", () => {
  it("sin assumptions guardadas → drivers auto", () => {
    const { drivers, source } = resolveBudgetDrivers(null, history);
    assert.equal(source, "auto");
    assert.equal(drivers.salesGrowthPct, 0);
    assert.equal(drivers.inflationPct, AUTO_INFLATION_PCT);
  });

  it("con assumptions guardadas → respetadas (fila de la base convertida a números)", () => {
    // Prisma regresa los Decimal como objetos con toString; la fila se convierte sin perder valores.
    const decimal = (value: string) => ({ toString: () => value, toNumber: () => Number(value) });
    const row = {
      salesGrowthPct: decimal("7.500"),
      inflationPct: decimal("3.200"),
      headcount: 1,
      headcountCostMonthly: decimal("18000.00"),
      debtInterestMonthly: decimal("0.00"),
      depreciationMonthly: decimal("250.00"),
    };
    const { drivers, source } = resolveBudgetDrivers(rowToBudgetDrivers(row), history);
    assert.equal(source, "manual");
    assert.deepEqual(drivers, {
      salesGrowthPct: 7.5,
      inflationPct: 3.2,
      headcount: 1,
      headcountCostMonthly: 18000,
      debtInterestMonthly: 0,
      depreciationMonthly: 250,
    });
  });
});
