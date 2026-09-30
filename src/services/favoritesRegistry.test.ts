import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyFavorites, toggleFavoriteId, type FavoritesState } from "../lib/favorites-storage";
import {
  FAVORITABLE_WIDGETS,
  FAVORITES_CATEGORY_LABEL_KEYS,
  FAVORITES_CATEGORY_ORDER,
  getFavoritesByCategory,
  getFavoritableWidget,
  hasAnyFavorites,
  hasCatalogFavorites,
  hasFavoritesInCategory,
  isRegisteredFavoriteId,
  isWidgetFavorited,
  resolveStorageBucket,
  type FavoritesCategory,
} from "./favoritesRegistry";

const VALID_CATEGORIES = new Set(["RESULTADOS", "FLUJO", "COBRANZA", "POSICION"]);
const VALID_TYPES = new Set(["KPI", "CHART", "TABLE"]);
const VALID_BUCKETS = new Set(["metric", "chart", "widget"]);

function stateWith(overrides: Partial<FavoritesState>): FavoritesState {
  return { ...emptyFavorites(), ...overrides };
}

describe("favoritesRegistry", () => {
  it("registra todos los widgets con id estable y único", () => {
    const ids = FAVORITABLE_WIDGETS.map((widget) => widget.id);
    assert.equal(new Set(ids).size, ids.length, "ids duplicados en el registro");
    assert.deepEqual([...ids].sort(), [
      "chart-cobranza-aging",
      "chart-cobranza-pareto",
      "chart-cogs-desglose",
      "chart-gasto-treemap",
      "chart-ingresos-costos",
      "chart-resultados-waterfall",
      "chart-sankey",
      "chart-tablero-diario",
      "chart-top5-clientes",
      "chart-top5-lineas",
      "destacados:costo",
      "destacados:ebitda",
      "destacados:gasto",
      "destacados:ingreso",
      "kpi-cobranza-cobrado",
      "kpi-cobranza-dpo",
      "kpi-cobranza-dso",
      "kpi-cobranza-facturacion",
      "kpi-cobranza-total-cartera",
      "kpi-flujo-caja",
      "kpi-flujo-entradas",
      "kpi-flujo-neto",
      "kpi-flujo-salidas",
      "table-posicion-balance",
      "table-posicion-razones",
      "table-posicion-resultados",
    ]);
  });

  it("cada widget tiene categoría, tipo, bucket y claves válidas", () => {
    for (const widget of FAVORITABLE_WIDGETS) {
      assert.ok(VALID_CATEGORIES.has(widget.category), `categoría inválida: ${widget.id}`);
      assert.ok(VALID_TYPES.has(widget.type), `tipo inválido: ${widget.id}`);
      assert.ok(VALID_BUCKETS.has(widget.storage), `bucket inválido: ${widget.id}`);
      assert.ok(widget.titleKey.length > 0, `titleKey vacío: ${widget.id}`);
      assert.ok(widget.componentKey.length > 0, `componentKey vacío: ${widget.id}`);
    }
  });

  it("cubre los 4 módulos con KPIs y gráficos/tablas", () => {
    for (const category of ["RESULTADOS", "FLUJO", "COBRANZA", "POSICION"] as const) {
      const widgets = FAVORITABLE_WIDGETS.filter((widget) => widget.category === category);
      assert.ok(widgets.length >= 3, `pocos widgets en ${category}`);
      assert.ok(
        widgets.some((widget) => widget.type !== "KPI"),
        `${category} sin gráficos/tablas fijables`,
      );
    }
    for (const category of ["RESULTADOS", "FLUJO", "COBRANZA"] as const) {
      assert.ok(
        FAVORITABLE_WIDGETS.some((widget) => widget.category === category && widget.type === "KPI"),
        `${category} sin KPIs fijables`,
      );
    }
  });

  it("expone orden y etiquetas de las 5 categorías", () => {
    assert.deepEqual(FAVORITES_CATEGORY_ORDER, ["RESULTADOS", "FLUJO", "COBRANZA", "POSICION", "METRICAS"]);
    for (const category of FAVORITES_CATEGORY_ORDER) {
      assert.equal(FAVORITES_CATEGORY_LABEL_KEYS[category], `control.categories.${category}`);
    }
  });

  it("resuelve el bucket de persistencia por id", () => {
    assert.equal(resolveStorageBucket("destacados:ingreso"), "metric");
    assert.equal(resolveStorageBucket("chart-sankey"), "widget");
    assert.equal(resolveStorageBucket("kpi-cobranza-dso"), "widget");
    assert.equal(resolveStorageBucket("id-desconocido"), "widget");
    assert.ok(isRegisteredFavoriteId("destacados:ingreso"));
    assert.ok(!isRegisteredFavoriteId("gross_margin"));
  });

  it("toggle + getFavoritesByCategory filtran por módulo y bucket", () => {
    let state = emptyFavorites();
    state = stateWith({
      favoriteMetricIds: toggleFavoriteId(state.favoriteMetricIds, "destacados:ingreso"),
      favoriteWidgetIds: ["chart-sankey", "kpi-flujo-entradas", "kpi-cobranza-dso"],
    });

    const resultados = getFavoritesByCategory(state, "RESULTADOS");
    assert.deepEqual(resultados.map((widget) => widget.id), ["destacados:ingreso"]);

    const flujo = getFavoritesByCategory(state, "FLUJO");
    assert.deepEqual(flujo.map((widget) => widget.id), ["kpi-flujo-entradas", "chart-sankey"]);

    const cobranza = getFavoritesByCategory(state, "COBRANZA");
    assert.deepEqual(cobranza.map((widget) => widget.id), ["kpi-cobranza-dso"]);

    assert.deepEqual(getFavoritesByCategory(state, "POSICION"), []);
    assert.deepEqual(getFavoritesByCategory(state, "METRICAS"), []);
  });

  it("isWidgetFavorited respeta el bucket de cada widget", () => {
    const destacados = getFavoritableWidget("destacados:ebitda");
    const sankey = getFavoritableWidget("chart-sankey");
    assert.ok(destacados && sankey);
    const state = stateWith({
      favoriteMetricIds: ["destacados:ebitda"],
      favoriteWidgetIds: ["chart-sankey"],
    });
    assert.ok(isWidgetFavorited(state, destacados));
    assert.ok(isWidgetFavorited(state, sankey));
    assert.ok(!isWidgetFavorited(state, { ...sankey, storage: "metric" }));
  });

  it("oculta secciones vacías y detecta favoritos de catálogo", () => {
    const empty = emptyFavorites();
    assert.equal(hasAnyFavorites(empty), false);
    for (const category of FAVORITES_CATEGORY_ORDER) {
      assert.equal(hasFavoritesInCategory(empty, category), false, `${category} debería estar vacía`);
    }

    const soloFlujo = stateWith({ favoriteWidgetIds: ["kpi-flujo-caja"] });
    assert.equal(hasAnyFavorites(soloFlujo), true);
    assert.equal(hasFavoritesInCategory(soloFlujo, "FLUJO"), true);
    assert.equal(hasFavoritesInCategory(soloFlujo, "RESULTADOS"), false);
    assert.equal(hasFavoritesInCategory(soloFlujo, "METRICAS"), false);

    const conDestacados = stateWith({ favoriteMetricIds: ["destacados:costo"] });
    assert.equal(hasFavoritesInCategory(conDestacados, "RESULTADOS"), true);
    assert.equal(hasFavoritesInCategory(conDestacados, "METRICAS"), false);
  });

  it("hasCatalogFavorites cubre métricas de catálogo y gráficos legacy", () => {
    assert.equal(hasCatalogFavorites(emptyFavorites()), false);
    assert.equal(hasCatalogFavorites(stateWith({ favoriteMetricIds: ["gross_margin"] })), true);
    assert.equal(hasCatalogFavorites(stateWith({ favoriteMetricIds: ["metric:wc:dso"] })), true);
    assert.equal(hasCatalogFavorites(stateWith({ favoriteChartIds: ["cash-projection"] })), true);
    assert.equal(hasCatalogFavorites(stateWith({ favoriteMetricIds: ["destacados:ingreso"] })), false);
    assert.equal(hasCatalogFavorites(stateWith({ favoriteWidgetIds: ["chart-sankey"] })), false);
  });

  it("cada categoría de módulo tiene al menos un widget registrado", () => {
    const categories: FavoritesCategory[] = ["RESULTADOS", "FLUJO", "COBRANZA", "POSICION"];
    for (const category of categories) {
      assert.ok(
        FAVORITABLE_WIDGETS.some((widget) => widget.category === category),
        `sin widgets: ${category}`,
      );
    }
  });
});
