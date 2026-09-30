"use client";

import { FavoriteCharts } from "@/components/charts/chart-registry";
import { CatalogMetricCard } from "@/components/metrics/catalog-metric-card";
import { renderModuleFavoriteMetric } from "@/components/metrics/module-metric-favorites";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import { useDashboardData } from "@/context/DashboardDataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useMetricsCatalog } from "@/hooks/use-metrics-catalog";
import { isRegisteredFavoriteId } from "@/services/favoritesRegistry";
import type { CatalogMetric } from "@/services/financialEngine";
import { useMemo } from "react";

type CatalogFavoritesSectionProps = {
  filters: ResultadosFilters;
};

/**
 * Sección "Otras Métricas del Catálogo" del Panel de Control: métricas del
 * catálogo de 50, métricas de módulos legacy (`metric:*`) y gráficos del
 * chart-registry. Los KPIs destacados (`destacados:*`) viven en la sección
 * de Resultados, registrados en favoritesRegistry.
 */
export function CatalogFavoritesSection({ filters }: CatalogFavoritesSectionProps) {
  const { favoriteMetricIds, favoriteChartIds } = useFavorites();
  const dashboard = useDashboardData();
  const comparable = filters.comparable === "mom" ? "mom" : "yoy";
  const { data: catalog } = useMetricsCatalog(comparable);

  const catalogByKey = useMemo(() => {
    if (!catalog) {
      return new Map<string, CatalogMetric>();
    }
    const all = Object.values(catalog.categories).flat();
    return new Map(all.map((metric) => [metric.key, metric]));
  }, [catalog]);

  const catalogIds = favoriteMetricIds.filter((id) => catalogByKey.has(id));
  const moduleIds = favoriteMetricIds.filter(
    (id) => id.startsWith("metric:") && !catalogByKey.has(id) && !isRegisteredFavoriteId(id),
  );
  const hasMetrics = catalogIds.length + moduleIds.length > 0;
  const hasCharts = favoriteChartIds.length > 0;

  if (!hasMetrics && !hasCharts) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasMetrics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {catalogIds.map((id) => {
            const metric = catalogByKey.get(id);
            return metric ? <CatalogMetricCard key={id} metric={metric} comparable={comparable} /> : null;
          })}
          {moduleIds.map((id) => (
            <div key={id}>{renderModuleFavoriteMetric(id, dashboard.pack, dashboard.loading)}</div>
          ))}
        </div>
      ) : null}
      {hasCharts ? (
        <FavoriteCharts ids={favoriteChartIds} pack={dashboard.pack} loading={dashboard.loading} />
      ) : null}
    </div>
  );
}
