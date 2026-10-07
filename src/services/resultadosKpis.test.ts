import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createT } from "@/i18n/translate";
import { calculateTopKPIs, categoryTemporalCards, temporalPeriodLabels } from "@/services/resultadosKpis";

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
