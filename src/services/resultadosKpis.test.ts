import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createT } from "@/i18n/translate";
import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import {
  calculateTopKPIs,
  calculateYearToDate,
  categoryTemporalCards,
  missingMonthsLabel,
  temporalPeriodLabels,
  yearToDateLabels,
} from "@/services/resultadosKpis";

describe("etiquetas de periodo de los KPI de resultados", () => {
  const es = createT("es");
  const en = createT("en");

  it("nombra el mes seleccionado y las cuatro temporalidades en julio 2026", () => {
    assert.deepEqual(temporalPeriodLabels("2026-07", es, "es"), {
      mesActual: "Julio 2026",
      mesAnterior: "Junio 2026",
      promedio3M: "Mayo–julio 2026",
      anoAnterior: "Julio 2025",
      trimAnterior: "Abril–junio 2026",
    });
  });

  it("incluye ambos años cuando el rango cruza de año", () => {
    assert.deepEqual(temporalPeriodLabels("2026-01", es, "es"), {
      mesActual: "Enero 2026",
      mesAnterior: "Diciembre 2025",
      promedio3M: "Noviembre 2025–enero 2026",
      anoAnterior: "Enero 2025",
      trimAnterior: "Octubre–diciembre 2025",
    });
  });

  it("traduce los meses al inglés", () => {
    const labels = temporalPeriodLabels("2026-07", en, "en");
    assert.equal(labels.mesActual, "July 2026");
    assert.equal(labels.promedio3M, "May–july 2026");
    assert.equal(labels.trimAnterior, "April–june 2026");
  });

  it("pone el mes seleccionado primero, sin variación y sin presupuesto", () => {
    const cards = categoryTemporalCards(
      calculateTopKPIs([], "Costo", "2026-07", null),
      "2026-07",
      "Costo",
      es,
      "es",
    );
    assert.deepEqual(
      cards.map((card) => card.key),
      ["mesActual", "mesAnterior", "promedio3M", "anoAnterior", "trimAnterior"],
    );
    assert.equal(cards[0]?.titleKey, "resultados.monthCost");
    assert.equal(cards[0]?.value, null);
    assert.equal(cards[0]?.deltaPct, null);
    assert.equal(cards[0]?.periodLabel, "Julio 2026");
    assert.equal(cards[1]?.periodLabel, "Junio 2026");
  });
});

function ingresoRow(periodo: string, cuentas: Record<string, number>): MonthlyFinancials {
  const total = Object.values(cuentas).reduce((sum, value) => sum + value, 0);
  return {
    periodo,
    ingreso_total: total,
    desglose_ingreso: cuentas,
    micro_categorias: {},
    costo_total: 0,
    desglose_costo: {},
    gasto_total: 0,
    desglose_gasto: {},
    ebitda: total,
  };
}

describe("acumulado del año de ingreso", () => {
  const es = createT("es");
  const rows = [
    ingresoRow("2025-01", { A: 80, B: 20 }),
    ingresoRow("2025-02", { A: 90 }),
    ingresoRow("2025-03", { A: 110 }),
    ingresoRow("2025-12", { A: 500 }),
    ingresoRow("2026-01", { A: 100, B: 50 }),
    ingresoRow("2026-02", { A: 120 }),
    ingresoRow("2026-03", { A: 130, B: 0.5 }),
    ingresoRow("2026-04", { A: 999 }),
  ];

  it("suma de enero al mes seleccionado, inclusive, sin tomar meses posteriores ni del año anterior", () => {
    const ytd = calculateYearToDate(rows, "Ingreso", "2026-03");
    assert.deepEqual(ytd.periodos, ["2026-01", "2026-02", "2026-03"]);
    assert.equal(ytd.value, 400.5);
    assert.deepEqual(ytd.missing, []);
  });

  it("compara contra el mismo rango del año anterior", () => {
    const ytd = calculateYearToDate(rows, "Ingreso", "2026-03");
    assert.equal(ytd.priorValue, 300);
    assert.equal(ytd.deltaPct, (400.5 - 300) / 300);
  });

  it("en enero el acumulado es el mes", () => {
    const ytd = calculateYearToDate(rows, "Ingreso", "2026-01");
    assert.equal(ytd.value, 150);
    assert.equal(ytd.priorValue, 100);
    assert.equal(yearToDateLabels("2026-01", es, "es").current, "Enero 2026");
  });

  it("no inventa meses faltantes: los reporta y no compara", () => {
    const sinFebrero = rows.filter((row) => row.periodo !== "2026-02");
    const ytd = calculateYearToDate(sinFebrero, "Ingreso", "2026-03");
    assert.equal(ytd.value, 280.5);
    assert.deepEqual(ytd.missing, ["2026-02"]);
    assert.equal(ytd.priorValue, null);
    assert.equal(ytd.deltaPct, null);
    assert.equal(missingMonthsLabel(ytd.missing, es, "es"), "febrero 2026");
  });

  it("sin comparativo si el año anterior está incompleto", () => {
    const ytd = calculateYearToDate(rows, "Ingreso", "2026-04");
    assert.equal(ytd.value, 1399.5);
    assert.equal(ytd.priorValue, null);
  });

  it("devuelve null si el año no tiene ningún mes", () => {
    const ytd = calculateYearToDate(rows, "Ingreso", "2027-02");
    assert.equal(ytd.value, null);
    assert.deepEqual(ytd.missing, ["2027-01", "2027-02"]);
  });

  it("nombra el rango actual y el del año anterior", () => {
    assert.deepEqual(yearToDateLabels("2026-07", es, "es"), {
      current: "Enero–julio 2026",
      prior: "Enero–julio 2025",
    });
    assert.equal(missingMonthsLabel(["2026-02", "2026-03", "2026-05"], es, "es"), "febrero, marzo y mayo 2026");
  });
});
