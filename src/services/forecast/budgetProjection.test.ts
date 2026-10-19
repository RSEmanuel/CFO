import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nowcastRubro, projectFromPoints } from "./budgetProjection";
import {
  AUTO_INFLATION_PCT,
  AUTO_SALES_GROWTH_MAX_PCT,
  applyBudgetDrivers,
  deriveAutoBudgetDrivers,
  deriveSalesGrowthPct,
  resolveBudgetDrivers,
  resolveProjectionDrivers,
  type BudgetDrivers,
} from "./drivers";
import { fromBalanzaPnl, hasOfficialBudget } from "./series";
import type { MonthlyPnlPoint } from "./types";

function point(periodo: string, ingreso: number, costo = 40, gasto = 20, official = 0): MonthlyPnlPoint {
  return {
    periodo,
    ingreso,
    costo,
    gasto,
    ebitda: ingreso - costo - gasto,
    officialIngreso: official,
    officialCosto: official,
    officialGasto: official,
  };
}

function seriesFrom(startYear: number, values: number[]): MonthlyPnlPoint[] {
  return values.map((ingreso, index) => {
    const date = new Date(startYear, index, 1);
    const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = date.getMonth() + 1;
    const ingresoVal = month === 12 ? 200 : month === 6 ? 50 : ingreso;
    return point(periodo, ingresoVal);
  });
}

describe("budgetProjection", () => {
  it("estacionalidad: el mes 12 proyectado se parece más al mes 12 histórico que al mes 6", () => {
    const values = Array.from({ length: 16 }, () => 100);
    const points = seriesFrom(2024, values);
    const result = projectFromPoints(points);
    assert.equal(result.rubros.ingreso.method, "seasonal_naive");
    const june = result.rubros.ingreso.months.find((row) => row.periodo.endsWith("-06"));
    const dec = result.rubros.ingreso.months.find((row) => row.periodo.endsWith("-12"));
    assert.ok(june);
    assert.ok(dec);
    const histDec = 200;
    const histJune = 50;
    assert.ok(Math.abs(dec.p50 - histDec) < Math.abs(dec.p50 - histJune));
  });

  it("ebitda P50 = ingreso − costo − gasto en cada mes", () => {
    const values = Array.from({ length: 24 }, () => 100);
    const result = projectFromPoints(seriesFrom(2024, values));
    for (const month of result.rubros.ebitda.months) {
      const ingreso = result.rubros.ingreso.months.find((row) => row.periodo === month.periodo);
      const costo = result.rubros.costo.months.find((row) => row.periodo === month.periodo);
      const gasto = result.rubros.gasto.months.find((row) => row.periodo === month.periodo);
      assert.ok(ingreso && costo && gasto);
      assert.equal(month.p50, ingreso.p50 - costo.p50 - gasto.p50);
    }
  });

  it("p20 ≤ p50 ≤ p80", () => {
    const values = Array.from({ length: 24 }, (_, index) => 100 + (index % 5) * 3);
    const result = projectFromPoints(seriesFrom(2024, values));
    for (const key of ["ingreso", "costo", "gasto", "ebitda"] as const) {
      for (const month of result.rubros[key].months) {
        assert.ok(month.p20 <= month.p50, `${key} ${month.periodo} p20>p50`);
        assert.ok(month.p50 <= month.p80, `${key} ${month.periodo} p50>p80`);
      }
    }
  });

  it("serie de 4 meses → unavailable, no NaN", () => {
    const points = seriesFrom(2024, [100, 110, 90, 105]);
    const result = projectFromPoints(points);
    assert.equal(result.rubros.ingreso.method, "unavailable");
    assert.equal(result.rubros.ingreso.months.length, 0);
    assert.equal(result.rubros.ebitda.method, "unavailable");
    assert.equal(result.rubros.ingreso.mapeHoldout, null);
    assert.ok(!Number.isNaN(result.rubros.ingreso.mapeHoldout));
    assert.ok(result.rubros.ingreso.assumptions.includes("serie_insuficiente"));
  });

  it("montoPresupuestado todo 0 → hasOfficialBudget false", () => {
    const points = seriesFrom(2024, Array.from({ length: 12 }, () => 100));
    const result = projectFromPoints(points, undefined, hasOfficialBudget(points));
    assert.equal(result.hasOfficialBudget, false);
    assert.equal(result.officialVsP50[0]?.official, null);
  });

  it("balanza usa movimiento PyG, no saldoFinal", () => {
    const rows = fromBalanzaPnl([
      {
        anio: 2025,
        periodo: 1,
        categoriaMaestra: "Ingreso",
        debe: 0,
        haber: 500,
        montoPresupuestado: 0,
      },
      {
        anio: 2025,
        periodo: 1,
        categoriaMaestra: "COGS",
        debe: 200,
        haber: 0,
        montoPresupuestado: 0,
      },
      {
        anio: 2025,
        periodo: 1,
        categoriaMaestra: "OpEx",
        debe: 50,
        haber: 0,
        montoPresupuestado: 0,
      },
    ]);
    assert.equal(rows[0]?.ingreso, 500);
    assert.equal(rows[0]?.costo, 200);
    assert.equal(rows[0]?.gasto, 50);
    assert.equal(rows[0]?.ebitda, 250);
  });

  it("respeta el periodo seleccionado como ancla", () => {
    const points = seriesFrom(2024, Array.from({ length: 24 }, () => 100));
    const result = projectFromPoints(points, undefined, false, "2025-06");
    assert.equal(result.rubros.ingreso.months[0]?.periodo, "2025-07");
    assert.equal(result.rubros.ingreso.months.length, 12);
  });

  it("nowcast entrena solo con meses anteriores", () => {
    const points = seriesFrom(2024, Array.from({ length: 18 }, () => 100));
    const value = nowcastRubro(points, "ingreso", "2025-06");
    assert.ok(value != null);
    assert.ok(Number.isFinite(value));
  });

  it("escenarios mantienen EBITDA reconciliado", () => {
    const points = seriesFrom(2024, Array.from({ length: 24 }, () => 100));
    const result = projectFromPoints(points, {
      gIngreso: 0.1,
      gCosto: 0,
      gGasto: 0,
    });
    for (const kind of ["base", "upside", "downside"] as const) {
      for (const month of result.scenarios[kind]) {
        assert.equal(
          month.ebitda,
          month.ingreso - month.costo - month.gasto,
        );
      }
    }
  });
});

function growingSeries(months: number, monthlyRate: number, start = 1000): MonthlyPnlPoint[] {
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(2025, index, 1);
    const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return point(periodo, start * (1 + monthlyRate) ** index);
  });
}

describe("supuestos de la proyección", () => {
  it("sin assumptions guardadas → drivers auto derivados del historial", () => {
    const history = growingSeries(12, 0.01);
    const { drivers, source } = resolveBudgetDrivers(null, history);
    assert.equal(source, "auto");
    // 1% mensual sostenido ≈ 12.7% al año.
    assert.equal(drivers.salesGrowthPct, 12.7);
    assert.equal(drivers.inflationPct, AUTO_INFLATION_PCT);
    assert.equal(drivers.headcount, 0);
    assert.equal(drivers.headcountCostMonthly, 0);
    assert.equal(drivers.debtInterestMonthly, 0);
    assert.equal(drivers.depreciationMonthly, 0);
  });

  it("con assumptions guardadas → se respetan tal cual", () => {
    const saved: BudgetDrivers = {
      salesGrowthPct: 5,
      inflationPct: 3,
      headcount: 2,
      headcountCostMonthly: 15000,
      debtInterestMonthly: 800,
      depreciationMonthly: 400,
    };
    const { drivers, source } = resolveBudgetDrivers(saved, growingSeries(12, 0.05));
    assert.equal(source, "manual");
    assert.deepEqual(drivers, saved);
  });

  it("el crecimiento automático usa solo los últimos 12 meses y se acota", () => {
    const flatThenSteep = [...growingSeries(12, 0), ...growingSeries(12, 0.08, 1000)].map((row, index) => ({
      ...row,
      periodo: `${2024 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
    }));
    assert.equal(deriveSalesGrowthPct(flatThenSteep), AUTO_SALES_GROWTH_MAX_PCT);
    assert.equal(deriveSalesGrowthPct(growingSeries(12, -0.05)), -10);
  });

  it("con menos de 6 meses con ventas no hay tendencia: crecimiento 0", () => {
    assert.equal(deriveSalesGrowthPct(growingSeries(5, 0.1)), 0);
    assert.equal(deriveAutoBudgetDrivers([]).salesGrowthPct, 0);
  });

  it("los drivers auto mueven ingreso por crecimiento y costo por inflación", () => {
    const history = growingSeries(16, 0.01);
    const base = projectFromPoints(history);
    const drivers = deriveAutoBudgetDrivers(history);
    const adjusted = applyBudgetDrivers(base, drivers);
    const baseIngreso = base.rubros.ingreso.months[0].p50;
    const baseCosto = base.rubros.costo.months[0].p50;
    assert.ok(Math.abs(adjusted.rubros.ingreso.months[0].p50 - baseIngreso * (1 + drivers.salesGrowthPct / 100)) < 0.02);
    assert.ok(Math.abs(adjusted.rubros.costo.months[0].p50 - baseCosto * (1 + AUTO_INFLATION_PCT / 100)) < 0.02);
  });
});

describe("supuestos automáticos sin doble conteo", () => {
  it("24 meses en modo auto: la base ya trae la tendencia y el p50 de ventas queda igual al de la base", () => {
    // Ventas cayendo 3% al mes: el crecimiento automático pegaría en el límite de -10%.
    const history = growingSeries(24, -0.03);
    const base = projectFromPoints(history);
    assert.equal(base.rubros.ingreso.method, "holt_winters");
    assert.equal(deriveSalesGrowthPct(history), -10);

    const resolved = resolveProjectionDrivers(base, null, history);
    assert.equal(resolved.source, "auto");
    assert.equal(resolved.driversApplied, false);
    assert.deepEqual(
      resolved.projection.rubros.ingreso.months.map((month) => month.p50),
      base.rubros.ingreso.months.map((month) => month.p50),
    );
    assert.deepEqual(
      resolved.projection.rubros.costo.months.map((month) => month.p50),
      base.rubros.costo.months.map((month) => month.p50),
    );
    assert.equal(resolved.drivers.salesGrowthPct, 0);
    assert.equal(resolved.drivers.inflationPct, 0);
  });

  it("historial corto en modo auto: la base no trae tendencia y sí se aplican los drivers automáticos", () => {
    const history = growingSeries(12, 0.01);
    const base = projectFromPoints(history);
    assert.notEqual(base.rubros.ingreso.method, "holt_winters");

    const resolved = resolveProjectionDrivers(base, null, history);
    assert.equal(resolved.source, "auto");
    assert.equal(resolved.driversApplied, true);
    assert.equal(resolved.drivers.salesGrowthPct, 12.7);
    assert.equal(resolved.drivers.inflationPct, AUTO_INFLATION_PCT);
    const baseIngreso = base.rubros.ingreso.months[0].p50;
    const baseCosto = base.rubros.costo.months[0].p50;
    assert.ok(Math.abs(resolved.projection.rubros.ingreso.months[0].p50 - baseIngreso * 1.127) < 0.02);
    assert.ok(Math.abs(resolved.projection.rubros.costo.months[0].p50 - baseCosto * (1 + AUTO_INFLATION_PCT / 100)) < 0.02);
  });

  it("supuestos guardados a mano se aplican aunque la base ya traiga la tendencia", () => {
    const history = growingSeries(24, -0.03);
    const base = projectFromPoints(history);
    const saved: BudgetDrivers = {
      salesGrowthPct: 5,
      inflationPct: 3,
      headcount: 0,
      headcountCostMonthly: 0,
      debtInterestMonthly: 0,
      depreciationMonthly: 0,
    };
    const resolved = resolveProjectionDrivers(base, saved, history);
    assert.equal(resolved.source, "manual");
    assert.equal(resolved.driversApplied, true);
    assert.deepEqual(resolved.drivers, saved);
    assert.ok(Math.abs(resolved.projection.rubros.ingreso.months[0].p50 - base.rubros.ingreso.months[0].p50 * 1.05) < 0.02);
  });
});
