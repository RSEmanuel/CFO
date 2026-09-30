import type { FavoritesState } from "@/lib/favorites-storage";

/**
 * Registro centralizado de todos los widgets fijables con estrella (⭐) en los
 * módulos Resultados, Flujo, Cobranza y Posición Financiera. Las 50 métricas
 * del catálogo no se enumeran aquí: son dinámicas (sus keys llegan por API) y
 * se tratan como la categoría METRICAS.
 *
 * `storage` indica en qué lista de FavoritesState vive el id, para integrarse
 * con el sistema de favoritos ya existente sin duplicarlo:
 * - "metric": favoriteMetricIds (métricas de catálogo y KPIs destacados).
 * - "chart": favoriteChartIds (gráficos del chart-registry de los dashboards).
 * - "widget": favoriteWidgetIds (KPIs/gráficos/tablas de módulos, este registro).
 */
export type FavoritesCategory = "RESULTADOS" | "FLUJO" | "COBRANZA" | "POSICION" | "METRICAS";

export type FavoritableWidgetType = "KPI" | "CHART" | "TABLE";

export type FavoritesStorageBucket = "metric" | "chart" | "widget";

export type FavoritableWidget = {
  /** Id estable persistido en favoritos; nunca cambiar una vez publicado. */
  id: string;
  /** Clave i18n del título visible del widget. */
  titleKey: string;
  category: Exclude<FavoritesCategory, "METRICAS">;
  type: FavoritableWidgetType;
  /** Clave usada por el Panel de Control para renderizar el componente real. */
  componentKey: string;
  storage: FavoritesStorageBucket;
  /** Gráficos anchos ocupan las 2 columnas del grid de gráficos. */
  wide?: boolean;
};

export const FAVORITES_CATEGORY_ORDER: FavoritesCategory[] = [
  "RESULTADOS",
  "FLUJO",
  "COBRANZA",
  "POSICION",
  "METRICAS",
];

export const FAVORITES_CATEGORY_LABEL_KEYS: Record<FavoritesCategory, string> = {
  RESULTADOS: "control.categories.RESULTADOS",
  FLUJO: "control.categories.FLUJO",
  COBRANZA: "control.categories.COBRANZA",
  POSICION: "control.categories.POSICION",
  METRICAS: "control.categories.METRICAS",
};

export const FAVORITABLE_WIDGETS: FavoritableWidget[] = [
  // ── Resultados y Rentabilidad (/dashboard/overview) ──────────────────────
  { id: "destacados:ingreso", titleKey: "resultados.income", category: "RESULTADOS", type: "KPI", componentKey: "destacadosRubro", storage: "metric" },
  { id: "destacados:costo", titleKey: "resultados.cost", category: "RESULTADOS", type: "KPI", componentKey: "destacadosRubro", storage: "metric" },
  { id: "destacados:gasto", titleKey: "resultados.expense", category: "RESULTADOS", type: "KPI", componentKey: "destacadosRubro", storage: "metric" },
  { id: "destacados:ebitda", titleKey: "resultados.ebitda", category: "RESULTADOS", type: "KPI", componentKey: "destacadosRubro", storage: "metric" },
  { id: "chart-ingresos-costos", titleKey: "widgets.trendTitle", category: "RESULTADOS", type: "CHART", componentKey: "tendenciaIngresosCostos", storage: "widget", wide: true },
  { id: "chart-top5-clientes", titleKey: "resultados.top5.clientsTitle", category: "RESULTADOS", type: "CHART", componentKey: "top5Clientes", storage: "widget" },
  { id: "chart-top5-lineas", titleKey: "resultados.top5.linesTitle", category: "RESULTADOS", type: "CHART", componentKey: "top5Lineas", storage: "widget" },
  { id: "chart-cogs-desglose", titleKey: "resultados.cogs.title", category: "RESULTADOS", type: "CHART", componentKey: "cogsDesglose", storage: "widget" },
  { id: "chart-gasto-treemap", titleKey: "resultados.opex.treemap.title", category: "RESULTADOS", type: "CHART", componentKey: "gastoTreemap", storage: "widget", wide: true },
  { id: "chart-resultados-waterfall", titleKey: "resultados.waterfallTitle", category: "RESULTADOS", type: "CHART", componentKey: "resultadosWaterfall", storage: "widget", wide: true },

  // ── Flujo y Tesorería (/dashboard/flujo) ─────────────────────────────────
  { id: "kpi-flujo-entradas", titleKey: "flujo.operativo.inflows", category: "FLUJO", type: "KPI", componentKey: "flujoOperativoKpi", storage: "widget" },
  { id: "kpi-flujo-salidas", titleKey: "flujo.operativo.outflows", category: "FLUJO", type: "KPI", componentKey: "flujoOperativoKpi", storage: "widget" },
  { id: "kpi-flujo-neto", titleKey: "flujo.operativo.netFlow", category: "FLUJO", type: "KPI", componentKey: "flujoOperativoKpi", storage: "widget" },
  { id: "kpi-flujo-caja", titleKey: "flujo.operativo.endingCash", category: "FLUJO", type: "KPI", componentKey: "flujoOperativoKpi", storage: "widget" },
  { id: "chart-sankey", titleKey: "flujo.efectivo.mapaTitle", category: "FLUJO", type: "CHART", componentKey: "flujoSankey", storage: "widget", wide: true },
  { id: "chart-tablero-diario", titleKey: "flujo.operativo.tab", category: "FLUJO", type: "CHART", componentKey: "flujoTableroDiario", storage: "widget", wide: true },

  // ── Cobranza y Cartera (/dashboard/cobranza) ─────────────────────────────
  { id: "kpi-cobranza-total-cartera", titleKey: "cobranza.cartera.totalPendienteCxc", category: "COBRANZA", type: "KPI", componentKey: "cobranzaCarteraKpi", storage: "widget" },
  { id: "kpi-cobranza-cobrado", titleKey: "cobranza.cartera.cobradoEnMes", category: "COBRANZA", type: "KPI", componentKey: "cobranzaCarteraKpi", storage: "widget" },
  { id: "kpi-cobranza-facturacion", titleKey: "cobranza.cartera.facturadoEnMes", category: "COBRANZA", type: "KPI", componentKey: "cobranzaCarteraKpi", storage: "widget" },
  { id: "kpi-cobranza-dso", titleKey: "cobranza.cartera.dsoTitle", category: "COBRANZA", type: "KPI", componentKey: "cobranzaPlazoKpi", storage: "widget" },
  { id: "kpi-cobranza-dpo", titleKey: "cobranza.cartera.dpoTitle", category: "COBRANZA", type: "KPI", componentKey: "cobranzaPlazoKpi", storage: "widget" },
  { id: "chart-cobranza-aging", titleKey: "cobranza.aging", category: "COBRANZA", type: "CHART", componentKey: "cobranzaAging", storage: "widget" },
  { id: "chart-cobranza-pareto", titleKey: "cobranza.concentracion.chartTitle", category: "COBRANZA", type: "CHART", componentKey: "cobranzaPareto", storage: "widget" },

  // ── Posición Financiera (/dashboard/posicion-financiera) ─────────────────
  { id: "table-posicion-balance", titleKey: "posicionFinanciera.titlePosition", category: "POSICION", type: "TABLE", componentKey: "posicionStatement", storage: "widget" },
  { id: "table-posicion-resultados", titleKey: "posicionFinanciera.titleResults", category: "POSICION", type: "TABLE", componentKey: "posicionStatement", storage: "widget" },
  { id: "table-posicion-razones", titleKey: "posicionFinanciera.titleRatios", category: "POSICION", type: "TABLE", componentKey: "posicionStatement", storage: "widget" },
];

const WIDGETS_BY_ID = new Map(FAVORITABLE_WIDGETS.map((widget) => [widget.id, widget]));

export function getFavoritableWidget(id: string): FavoritableWidget | undefined {
  return WIDGETS_BY_ID.get(id);
}

export function isRegisteredFavoriteId(id: string): boolean {
  return WIDGETS_BY_ID.has(id);
}

/** Bucket de persistencia para un id: el registrado, o "widget" para ids nuevos. */
export function resolveStorageBucket(id: string): FavoritesStorageBucket {
  return WIDGETS_BY_ID.get(id)?.storage ?? "widget";
}

export function isWidgetFavorited(state: FavoritesState, widget: FavoritableWidget): boolean {
  switch (widget.storage) {
    case "metric":
      return state.favoriteMetricIds.includes(widget.id);
    case "chart":
      return state.favoriteChartIds.includes(widget.id);
    case "widget":
      return state.favoriteWidgetIds.includes(widget.id);
  }
}

export function getFavoritesByCategory(
  state: FavoritesState,
  category: FavoritesCategory,
): FavoritableWidget[] {
  if (category === "METRICAS") {
    return [];
  }
  return FAVORITABLE_WIDGETS.filter(
    (widget) => widget.category === category && isWidgetFavorited(state, widget),
  );
}

/**
 * METRICAS es dinámica: métricas de catálogo (keys por API), métricas de
 * módulos legacy (`metric:*`) y gráficos del chart-registry. Todo id de
 * métrica no registrado en este archivo pertenece a esa sección.
 */
export function hasCatalogFavorites(state: FavoritesState): boolean {
  return (
    state.favoriteChartIds.length > 0 ||
    state.favoriteMetricIds.some((id) => !isRegisteredFavoriteId(id))
  );
}

/** Ocultación inteligente: una sección solo se muestra si tiene favoritos. */
export function hasFavoritesInCategory(state: FavoritesState, category: FavoritesCategory): boolean {
  if (category === "METRICAS") {
    return hasCatalogFavorites(state);
  }
  return getFavoritesByCategory(state, category).length > 0;
}

export function hasAnyFavorites(state: FavoritesState): boolean {
  return FAVORITES_CATEGORY_ORDER.some((category) => hasFavoritesInCategory(state, category));
}
