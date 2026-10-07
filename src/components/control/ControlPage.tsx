"use client";

import {
  FavoriteWidgetRenderer,
  type ControlWidgetContext,
} from "@/components/control/favorite-widget-renderer";
import { DataEmptyState } from "@/components/data-empty-state";
import { CatalogFavoritesSection } from "@/components/metrics/favorite-metrics-grid";
import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { Button } from "@/components/ui/button";
import { DashboardDataProvider } from "@/context/DashboardDataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useResultados } from "@/hooks/use-resultados";
import {
  FAVORITES_CATEGORY_LABEL_KEYS,
  FAVORITES_CATEGORY_ORDER,
  getFavoritesByCategory,
  hasAnyFavorites,
  hasCatalogFavorites,
} from "@/services/favoritesRegistry";
import { getDestacadosKpis, type MonthlyFinancials } from "@/services/financialDataTransformer";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function ControlEmptyState() {
  const { t } = useLocale();
  return (
    <DataEmptyState
      title={t("control.emptyTitle")}
      message={t("control.emptyMessage")}
      description={null}
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/overview">{t("control.emptyCtaResults")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/flujo">{t("control.emptyCtaFlujo")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/cobranza">{t("control.emptyCtaCobranza")}</Link>
          </Button>
        </div>
      }
    />
  );
}

function ControlBody({
  filters,
  rows,
}: {
  filters: ResultadosFilters;
  rows: MonthlyFinancials[];
}) {
  const { t } = useLocale();
  const favorites = useFavorites();
  const kpis = useMemo(() => getDestacadosKpis(rows, filters), [rows, filters]);
  const context: ControlWidgetContext = useMemo(
    () => ({ periodo: filters.periodo, units: filters.units, rows, kpis, filters }),
    [filters, rows, kpis],
  );

  if (!hasAnyFavorites(favorites)) {
    return <ControlEmptyState />;
  }

  return (
    <>
      {FAVORITES_CATEGORY_ORDER.map((category) => {
        if (category === "METRICAS") {
          return hasCatalogFavorites(favorites) ? (
            <section key={category} className="space-y-4">
              <h2 className="font-sans text-xl font-medium text-foreground">
                {t(FAVORITES_CATEGORY_LABEL_KEYS[category])}
              </h2>
              <CatalogFavoritesSection filters={filters} />
            </section>
          ) : null;
        }

        const widgets = getFavoritesByCategory(favorites, category);
        if (widgets.length === 0) {
          return null;
        }
        return (
          <section key={category} className="space-y-4">
            <h2 className="font-sans text-xl font-medium text-foreground">
              {t(FAVORITES_CATEGORY_LABEL_KEYS[category])}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {widgets.map((widget) => {
                const spanClass =
                  widget.type === "KPI"
                    ? "col-span-1"
                    : widget.type === "CHART"
                      ? widget.wide
                        ? "col-span-1 md:col-span-2 xl:col-span-4"
                        : "col-span-1 md:col-span-2 xl:col-span-2"
                      : "col-span-1 md:col-span-2 xl:col-span-4";

                return (
                  <div key={widget.id} className={spanClass}>
                    <FavoriteWidgetRenderer widget={widget} context={context} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function ControlPage() {
  const { t } = useLocale();
  const { activePeriod, availablePeriods, selectPeriod } = useSession();
  const { data, loading, error } = useResultados();
  const [filters, setFilters] = useState<ResultadosFilters>({
    ...INITIAL_RESULTADOS_FILTERS,
    periodo: "",
  });

  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? "" }));
  }, [activePeriod]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("resultados.loadError")} message={error} />;
  }

  const rows = data?.series ?? [];
  const periods = data?.availablePeriods.length ? data.availablePeriods : availablePeriods;
  const effectivePeriod = filters.periodo || periods.at(-1) || activePeriod || "";

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 bg-background">
      <header className="space-y-1">
        <p className="text-lg font-bold tracking-tight text-clay">{t("nav.control")}</p>
        <p className="text-sm text-muted-foreground">{t("control.subtitle")}</p>
      </header>

      <ResultadosFilterBar
        filters={filters}
        availablePeriods={periods}
        onChange={(next) => {
          setFilters(next);
          if (next.periodo && next.periodo !== filters.periodo) {
            selectPeriod(next.periodo);
          }
        }}
      />

      <DashboardDataProvider>
        <div className="space-y-8">
          <ControlBody filters={{ ...filters, periodo: effectivePeriod || filters.periodo }} rows={rows} />
        </div>
      </DashboardDataProvider>
    </div>
  );
}
