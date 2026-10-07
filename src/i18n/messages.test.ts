import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale } from "./config";
import { collectKeys, createT, MESSAGES } from "./translate";

describe("i18n catalogs", () => {
  it("es and en share the same keys", () => {
    assert.deepEqual(collectKeys(MESSAGES.es).sort(), collectKeys(MESSAGES.en).sort());
  });

  it("defaults to Spanish", () => {
    assert.equal(DEFAULT_LOCALE, "es");
    assert.equal(createT("es")("nav.results"), "Resultados");
    assert.equal(createT("en")("nav.results"), "Results");
    assert.equal(createT("es")("nav.control"), "Panel de Control");
    assert.equal(createT("en")("nav.control"), "Control Panel");
    assert.equal(createT("en")("settings.languageTitle"), "Portal language");
  });

  it("translates the income total chart without translating account names", () => {
    const accountName = "Servicios marítimos 4102";
    assert.equal(createT("es")("resultados.incomeTotal"), "Ingreso total");
    assert.equal(createT("en")("resultados.incomeTotal"), "Total revenue");
    assert.equal(accountName, "Servicios marítimos 4102");
  });

  it("accepts only es and en and persists under cfo.locale", () => {
    assert.equal(LOCALE_STORAGE_KEY, "cfo.locale");
    assert.equal(isLocale("es"), true);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("fr"), false);
  });

  it("translates the new client-feedback surfaces", () => {
    const es = createT("es");
    const en = createT("en");
    for (const key of [
      "resultados.cogs.analisisTitle",
      "resultados.cogs.modeBoth",
      "resultados.cogs.rows.utilidadBruta",
      "resultados.incomeBreakdown",
      "resultados.incomeBreakdownOther",
      "resultados.incomeBreakdownCenter",
  "resultados.incomeByClient",
  "resultados.incomeByLine",
  "resultados.incomeMixEmpty",
  "resultados.incomeMixEmptyPeriod",
  "resultados.incomeMixNoClientes",
      "resultados.verticalAnalysis",
      "resultados.pctOfRevenue",
      "resultados.others",
      "resultados.drivers.title",
      "resultados.drivers.saved",
      "resultados.groupQuarter",
      "cobranza.agingSchedule",
      "cobranza.agingBuckets.corriente",
      "cobranza.agingBuckets.d90_plus",
      "cobranza.cartera.dsoTitle",
      "cobranza.cartera.dpoTitle",
      "cobranza.cartera.brechaTitle",
      "cobranza.cartera.plazoSubtitle",
      "cobranza.cartera.brechaSuperavit",
      "flujo.operativo.tab",
      "flujo.operativo.categories.cobranza",
      "flujo.operativo.categories.pagoDeuda",
      "flujo.operativo.categories.otrosEntradas",
      "flujo.operativo.categories.otrosSalidas",
      "resultados.sankeyError",
      "errors.prismaClientStale",
      "posicionFinanciera.waterfall.steps.financieros",
      "posicionFinanciera.waterfall.steps.impuestos",
      "flujo.efectivo.tab",
      "flujo.efectivo.mapaTitle",
      "flujo.efectivo.mapaHelp",
      "flujo.efectivo.saldoInicial",
      "flujo.efectivo.saldoFinal",
      "flujo.efectivo.caja",
      "flujo.efectivo.excluirTraspasos",
      "flujo.efectivo.entradasOperativas",
      "flujo.efectivo.salidasOperativas",
      "flujo.efectivo.emptyTitle",
      "ingesta.docTypes.flujo_efectivo",
      "ingesta.docTypes.auxiliar_cuentas",
      "ingesta.commitBlockedPeriod",
      "ingesta.commitBlockedProfile",
      "nav.control",
      "control.title",
      "control.subtitle",
      "control.emptyTitle",
      "control.emptyMessage",
      "control.emptyCta",
      "control.pinnedWidgets",
      "resultados.opex.title",
      "resultados.opex.mainItems",
      "resultados.opex.others",
      "resultados.opex.absorptionTitle",
      "resultados.opex.jawsTitle",
      "resultados.opex.jawsHealthy",
      "resultados.opex.laborTitle",
      "resultados.opex.splitTitle",
      "resultados.opex.alertsTitle",
      "resultados.opex.alertsSubtitle",
      "resultados.opex.alertsEmpty",
      "resultados.opex.alertsAudit",
      "resultados.top5.seriesWindow",
      "resultados.top5.tooltipTotal",
      "resultados.top5.shareNoteClients",
      "resultados.top5.shareNoteLines",
      "resultados.top5.restoClampedNote",
      "posicionFinanciera.waterfall.title",
      "posicionFinanciera.waterfall.steps.ingresos",
      "posicionFinanciera.gauges.title",
      "posicionFinanciera.gauges.zones.green",
      "posicionFinanciera.gauges.metrics.dso",
    ]) {
      const esValue = es(key);
      const enValue = en(key);
      assert.notEqual(esValue, key, `missing es: ${key}`);
      assert.notEqual(enValue, key, `missing en: ${key}`);
      assert.notEqual(esValue, enValue, `untranslated: ${key}`);
    }
  });

  it("interpolates the trade-term deficit badge in es and en", () => {
    const es = createT("es")("cobranza.cartera.brechaDeficit", { days: "88.61" });
    const en = createT("en")("cobranza.cartera.brechaDeficit", { days: "88.61" });
    assert.match(es, /88\.61/);
    assert.match(en, /88\.61/);
    assert.match(es, /Déficit/);
    assert.match(en, /deficit/i);
    assert.notEqual(es, en);
  });
});

