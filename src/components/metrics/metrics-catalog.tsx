"use client";

import { FavoriteCharts } from "@/components/charts/chart-registry";
import { CatalogMetricCard } from "@/components/metrics/catalog-metric-card";
import { HIGHLIGHT_KEYS } from "@/components/metrics/catalog-presenter";
import { renderModuleFavoriteMetric } from "@/components/metrics/module-metric-favorites";
import {
  MetricsFilterBar,
  type MetricsFilters,
} from "@/components/metrics/metrics-filter-bar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardData } from "@/context/DashboardDataContext";
import { useLocale } from "@/context/LocaleContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useMetricsCatalog } from "@/hooks/use-metrics-catalog";
import type { CatalogMetric, MetricCategory } from "@/services/financialEngine";
import { AlertCircle, Info, RefreshCw, Star } from "lucide-react";
import { useMemo, useState } from "react";

const CATEGORY_ORDER: MetricCategory[] = [
  "margenes",
  "retorno",
  "eficiencia",
  "liquidez",
  "solvencia",
  "gestion",
];

const INITIAL_FILTERS: MetricsFilters = {
  temporalidad: "month",
  comparable: "mom",
  currency: "mxn",
  units: "exact",
  analysis: "pct",
};

function MetricsGrid({
  metrics,
  comparable,
}: {
  metrics: CatalogMetric[];
  comparable: MetricsFilters["comparable"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <CatalogMetricCard key={metric.id} metric={metric} comparable={comparable} />
      ))}
    </div>
  );
}

function CatalogSkeleton() {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("metrics.loading")}>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-[238px] animate-pulse rounded-card border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex justify-between">
            <div className="h-4 w-8 rounded bg-muted" />
            <div className="h-6 w-20 rounded-full bg-muted" />
          </div>
          <div className="mt-6 h-10 w-4/5 rounded bg-muted" />
          <div className="mt-12 h-9 w-2/5 rounded bg-muted" />
          <div className="mt-3 h-6 w-1/2 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function MetricsCatalog() {
  const { t } = useLocale();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const { data, loading, error, retry } = useMetricsCatalog(filters.comparable);
  const { favoriteMetricIds, favoriteChartIds } = useFavorites();
  const dashboard = useDashboardData();

  const allMetrics = useMemo(
    () => (data ? CATEGORY_ORDER.flatMap((category) => data.categories[category]) : []),
    [data],
  );
  const catalogByKey = useMemo(() => new Map(allMetrics.map((metric) => [metric.key, metric])), [allMetrics]);
  const highlights = useMemo(
    () =>
      HIGHLIGHT_KEYS.map((key) => catalogByKey.get(key)).filter((metric): metric is CatalogMetric => Boolean(metric)),
    [catalogByKey],
  );

  const favoriteCatalog = favoriteMetricIds
    .map((id) => catalogByKey.get(id))
    .filter((metric): metric is CatalogMetric => Boolean(metric));
  const favoriteModuleIds = favoriteMetricIds.filter((id) => id.startsWith("metric:"));
  const hasCustomMetrics = favoriteCatalog.length > 0 || favoriteModuleIds.length > 0;
  const hasCustomCharts = favoriteChartIds.length > 0;

  const limitations = [
    filters.temporalidad !== "month"
      ? t("metrics.limitationPeriod")
      : null,
    filters.currency === "usd"
      ? t("metrics.limitationCurrency")
      : null,
    filters.units !== "exact" || filters.analysis === "amount"
      ? t("metrics.limitationUnits")
      : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="metrics-page space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-lg font-bold tracking-tight text-clay">{t("nav.metrics")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("metrics.intro")}
          </p>
        </div>
        {data ? (
          <span className="w-fit rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {t("metrics.available", { count: allMetrics.length })}
          </span>
        ) : null}
      </div>

      <MetricsFilterBar filters={filters} onChange={setFilters} />

      {limitations.length > 0 ? (
        <div className="rounded-card border border-category-efficiencyFg/25 bg-category-efficiency px-4 py-3 text-sm text-category-efficiencyFg">
          {limitations.map((message) => (
            <p key={message} className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-desfavorable/20 bg-category-solvency p-5 text-desfavorable">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-5 w-5" />
            {t("metrics.loadError")}
          </div>
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCw className="h-4 w-4" />
            {t("metrics.retry")}
          </Button>
        </div>
      ) : loading ? (
        <CatalogSkeleton />
      ) : data ? (
        <Tabs defaultValue="highlights">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max flex-nowrap">
              <TabsTrigger value="highlights">{t("metrics.highlights")}</TabsTrigger>
              {CATEGORY_ORDER.map((category) => (
                <TabsTrigger key={category} value={category}>
                  {t(`metrics.categories.${category}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="highlights" className="space-y-8">
            {!hasCustomMetrics ? (
              <>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-category-efficiencyFg" />
                  {t("metrics.customizeHelp")}
                </p>
                <MetricsGrid metrics={highlights} comparable={filters.comparable} />
              </>
            ) : (
              <div className="space-y-4">
                <h3 className="font-serif text-xl font-medium">{t("metrics.favorites")}</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {favoriteMetricIds.map((id) => {
                    const catalog = catalogByKey.get(id);
                    if (catalog) {
                      return <CatalogMetricCard key={id} metric={catalog} comparable={filters.comparable} />;
                    }
                    return <div key={id}>{renderModuleFavoriteMetric(id, dashboard.pack, dashboard.loading)}</div>;
                  })}
                </div>
              </div>
            )}
            {hasCustomCharts ? (
              <FavoriteCharts ids={favoriteChartIds} pack={dashboard.pack} loading={dashboard.loading} />
            ) : null}
          </TabsContent>
          {CATEGORY_ORDER.map((category) => (
            <TabsContent key={category} value={category}>
              <MetricsGrid metrics={data.categories[category]} comparable={filters.comparable} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="rounded-card border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("metrics.none")}
        </div>
      )}
    </div>
  );
}
