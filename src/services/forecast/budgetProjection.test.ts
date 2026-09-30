import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nowcastRubro, projectFromPoints } from "./budgetProjection";
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
