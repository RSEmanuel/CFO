import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ResultadosFilters } from "../components/resultados/resultados-filter-bar";
import type { BudgetProjectionPayload } from "./budgetProjectionService";
import { projectFromPoints } from "./forecast/budgetProjection";
import type { MonthlyPnlPoint } from "./forecast/types";
import {
  buildGroupedProjection,
  buildPresupuestoViewModel,
  type EscenarioPresupuesto,
  type HorizonMonths,
} from "./resultadosPresupuesto";

const filters: ResultadosFilters = {
  temporalidad: "month",
  periodo: "2025-12",
  comparable: "yoy",
  currency: "mxn",
  units: "m",
  analysis: "amount",
};

function history(): MonthlyPnlPoint[] {
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(2024, index, 1);
    const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const ingreso = 100 + (index % 12) * 2;
    const costo = 45 + (index % 3);
    const gasto = 20;
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

function payload(withOfficial: boolean): BudgetProjectionPayload {
  const points = history();
  const projection = projectFromPoints(points, undefined, withOfficial, "2025-12");
  return {
    tenantId: "tenant-test",
    anchorPeriodo: "2025-12",
    projection,
    history: points,
    official: withOfficial
      ? projection.rubros.ingreso.months.map((month) => ({
          periodo: month.periodo,
          ingreso: 125,
          costo: 55,
          gasto: 22,
          ebitda: 48,
        }))
      : [],
    source: "ledger",
    sourceMonths: points.length,
    hasOfficialBudget: withOfficial,
    status: "available",
    drivers: null,
  };
}

function model(
  temporalidad: ResultadosFilters["temporalidad"],
  scenario: EscenarioPresupuesto = "base",
  horizon: HorizonMonths = 12,
) {
  return buildPresupuestoViewModel(
    payload(true),
    { ...filters, temporalidad },
    horizon,
    scenario,
    0,
  );
}

describe("resultadosPresupuesto", () => {
  it("agrega 1/3/12 meses según temporalidad", () => {
    const month = model("month");
    const quarter = model("quarter");
    const year = model("year");
    assert.equal(month.rows[0]?.official, 125);
    assert.equal(quarter.rows[0]?.official, 375);
    assert.equal(year.rows[0]?.official, 1500);
  });

  it("oficial ausente se muestra como null, no cero", () => {
    const view = buildPresupuestoViewModel(
      payload(false),
      filters,
      12,
      "base",
      0,
    );
    assert.equal(view.hasOfficial, false);
    assert.ok(view.rows.every((row) => row.official === null));
    assert.ok(view.rows.every((row) => row.deltaVsOfficial === null));
  });

  it("conservador reduce EBITDA frente a estirado", () => {
    const conservative = model("month", "conservador");
    const stretched = model("month", "estirado");
    const conservativeEbitda = conservative.rows.find(
      (row) => row.key === "ebitda",
    )?.projection;
    const stretchedEbitda = stretched.rows.find(
      (row) => row.key === "ebitda",
    )?.projection;
    assert.ok(conservativeEbitda != null && stretchedEbitda != null);
    assert.ok(conservativeEbitda <= stretchedEbitda);
  });

  it("costo menor al oficial produce delta negativo para lower-is-better", () => {
    const view = model("month");
    const costo = view.rows.find((row) => row.key === "costo");
    assert.ok(costo?.deltaVsOfficial != null);
    assert.ok(costo.deltaVsOfficial < 0);
  });

  it("agrupa la proyección por trimestre, semestre y año sin perder el total", () => {
    const data = payload(true);
    const quarters = buildGroupedProjection(data, "base", 0, "quarter");
    const semesters = buildGroupedProjection(data, "base", 0, "semester");
    const years = buildGroupedProjection(data, "base", 0, "year");

    assert.equal(quarters.length, 4);
    assert.equal(semesters.length, 2);
    assert.equal(years.length, 1);
    assert.ok(quarters.every((row) => /^Q[1-4]-\d{2}$/.test(row.label)));
    assert.ok(semesters.every((row) => /^S[12]-\d{2}$/.test(row.label)));

    const totalOf = (rows: typeof quarters) =>
      rows.reduce((sum, row) => sum + (row.ingreso ?? 0), 0);
    assert.ok(Math.abs(totalOf(quarters) - totalOf(semesters)) < 0.05);
    assert.ok(Math.abs(totalOf(quarters) - totalOf(years)) < 0.05);

    for (const row of [...quarters, ...semesters, ...years]) {
      if (row.ingreso == null || row.costo == null || row.gasto == null || row.ebitda == null) {
        continue;
      }
      assert.ok(Math.abs(row.ebitda - (row.ingreso - row.costo - row.gasto)) < 0.05);
    }
  });
});
