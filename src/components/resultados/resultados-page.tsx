"use client";

import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { EstadoOperativoCard } from "@/components/resultados/EstadoOperativoCard";
import { RifAuditoriaView } from "@/components/resultados/RifAuditoriaView";
import { ResultadosCategoryView } from "@/components/resultados/ResultadosCategoryView";
import { DestacadosRubroCard, rubroTitleKey } from "@/components/resultados/DestacadosRubroCard";
import { EstadoResultadosView } from "@/components/resultados/EstadoResultadosView";
import { ResultadosWaterfallChart } from "@/components/resultados/ResultadosWaterfallChart";
import { ResultadosPresupuestoView } from "@/components/resultados/ResultadosPresupuestoView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataEmptyState } from "@/components/data-empty-state";
import { DataOriginBadge } from "@/components/data-origin-badge";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useBudgetProjection } from "@/hooks/use-budget-projection";
import { useResultados } from "@/hooks/use-resultados";
import { cn } from "@/lib/utils";
import { buildStackedSeries, getDestacadosKpis, type ResultadosCategoryName } from "@/services/financialDataTransformer";
import { downloadPaqueteDelMesPdf } from "@/services/resultadosPaquetePdf";
import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const RESULTADOS_TABS = [
  { value: "ingreso", labelKey: "resultados.tabIncome" },
  { value: "costo", labelKey: "resultados.tabCost" },
  { value: "gasto", labelKey: "resultados.tabExpense" },
  { value: "estado-resultados", labelKey: "resultados.tabPl" },
  { value: "operativo", labelKey: "resultados.tabOperativo" },
  { value: "otras", labelKey: "resultados.tabRifAuditoria" },
  { value: "presupuesto", labelKey: "resultados.tabBudget" },
] as const;

const DEFAULT_RESULTADOS_TAB = "ingreso";

const CATEGORY_TABS: Record<string, ResultadosCategoryName> = {
  ingreso: "Ingreso",
  costo: "Costo",
  gasto: "Gasto",
};

export function ResultadosPage() {
  const { t, locale, formatDate } = useLocale();
  const { tenantId, tenants, user, activePeriod, availablePeriods, selectPeriod } = useSession();
  const { data, loading, error } = useResultados();
  const [tab, setTab] = useState<(typeof RESULTADOS_TABS)[number]["value"]>(DEFAULT_RESULTADOS_TAB);
  const [filters, setFilters] = useState<ResultadosFilters>({
    ...INITIAL_RESULTADOS_FILTERS,
    periodo: "",
  });
  const [downloadPending, setDownloadPending] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "destacados" || fromUrl === "resultados") {
      setTab(DEFAULT_RESULTADOS_TAB);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", DEFAULT_RESULTADOS_TAB);
      window.history.replaceState({}, "", url);
    } else if (fromUrl && RESULTADOS_TABS.some((item) => item.value === fromUrl)) {
      setTab(fromUrl as (typeof RESULTADOS_TABS)[number]["value"]);
    }
  }, []);
  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? "" }));
  }, [activePeriod]);
  const {
    data: budgetData,
    loading: budgetLoading,
    error: budgetError,
    refetch: refetchBudget,
  } = useBudgetProjection(filters.periodo);

  const seriesByCategory = useMemo(() => {
    const rows = data?.series ?? [];
    return {
      Ingreso: buildStackedSeries(rows, filters, "Ingreso"),
      Costo: buildStackedSeries(rows, filters, "Costo"),
      Gasto: buildStackedSeries(rows, filters, "Gasto"),
    };
  }, [data, filters]);

  const kpis = useMemo(() => getDestacadosKpis(data?.series ?? [], filters), [data?.series, filters]);

  const empresa =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  const downloadPack = async () => {
    if (downloadPending) return;
    setDownloadPending(true);
    const startedAt = Date.now();
    try {
      downloadPaqueteDelMesPdf({
        empresa,
        periodo: filters.periodo,
        generatedAt: new Date(),
        locale,
        labels: {
          brand: t("pdf.brand"),
          period: t("pdf.period", { period: filters.periodo }),
          date: t("pdf.date", { date: formatDate(new Date()) }),
          packageTitle: t("pdf.packageTitle"),
          rubro: t("pdf.rubro"),
          amount: t("pdf.amount"),
          variation: t("pdf.variation"),
          context: t("pdf.context"),
          noComparable: t("pdf.noComparable"),
        },
        units: filters.units,
        contextLabel: kpis.contextLabel,
        rubros: kpis.rubros.map((rubro) => ({
          title: t(rubroTitleKey(rubro.key)),
          value: rubro.value,
          deltaPct: rubro.deltaPct,
        })),
      });
    } catch {
      toast.error(t("resultados.pdfError"));
    } finally {
      const remaining = Math.max(0, 1_000 - (Date.now() - startedAt));
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
      setDownloadPending(false);
    }
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("resultados.loadError")} message={error} />;
  }
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("resultados.emptyTitle")}
        message={t("resultados.emptyMessage")}
      />
    );
  }

  const effectivePeriod =
    filters.periodo || data.availablePeriods.at(-1) || activePeriod || "";
  const periodHasData = !effectivePeriod || data.series.some((row) => row.periodo === effectivePeriod);

  return (
    <div className="mx-auto w-full max-w-[1680px] bg-background">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as typeof tab;
          setTab(next);
          const url = new URL(window.location.href);
          url.searchParams.set("tab", next);
          window.history.replaceState({}, "", url);
        }}
      >
        <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-background px-4 pt-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
          <p className="mb-2 text-lg font-bold tracking-tight text-clay">{t("nav.results")}</p>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 border-0 bg-transparent p-0">
            {RESULTADOS_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "rounded-full border-0 bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-none",
                  "hover:bg-muted/80 hover:text-foreground",
                  "data-[state=active]:border-0 data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:shadow-none",
                )}
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-4">
          <ResultadosFilterBar
            filters={filters}
            availablePeriods={data.availablePeriods.length ? data.availablePeriods : availablePeriods}
            onChange={(next) => {
              setFilters(next);
              if (next.periodo && next.periodo !== filters.periodo) selectPeriod(next.periodo);
            }}
            trailing={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={downloadPending}
                  onClick={() => void downloadPack()}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("resultados.budgetPackage")}
                </Button>
                <DataOriginBadge origin={data.periodOrigins[effectivePeriod]} />
              </div>
            }
          />
        </div>

        {periodHasData ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.rubros.map((rubro) => (
              <DestacadosRubroCard
                key={rubro.key}
                rubro={rubro}
                units={filters.units}
                contextLabel={kpis.contextLabel}
              />
            ))}
          </div>
        ) : null}

        {!periodHasData ? (
          <div className="mt-4">
            <DataEmptyState
              title={t("resultados.emptyPeriodTitle", { periodo: effectivePeriod })}
              message={t("resultados.emptyPeriodMessage")}
            />
          </div>
        ) : (
          RESULTADOS_TABS.map((item) => {
            const category = CATEGORY_TABS[item.value];
            const series = category ? seriesByCategory[category] : null;
            return (
              <TabsContent key={item.value} value={item.value} className="mt-4">
                {item.value === "estado-resultados" ? (
                  <EstadoResultadosView periodo={effectivePeriod} />
                ) : item.value === "presupuesto" ? (
                  <ResultadosPresupuestoView
                    filters={filters}
                    data={budgetData}
                    loading={budgetLoading}
                    error={budgetError}
                    onDriversSaved={refetchBudget}
                  />
                ) : item.value === "operativo" ? (
                  <div className="space-y-6">
                    <ChartErrorBoundary
                      fallback={
                        <section className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
                          {t("resultados.waterfallError")}
                        </section>
                      }
                    >
                      <ResultadosWaterfallChart filters={filters} rows={data.series} />
                    </ChartErrorBoundary>
                    <EstadoOperativoCard periodo={effectivePeriod} />
                  </div>
                ) : item.value === "otras" ? (
                  <RifAuditoriaView periodo={effectivePeriod} />
                ) : category && series ? (
                  <ResultadosCategoryView
                    category={category}
                    periodo={effectivePeriod}
                    temporalidad={filters.temporalidad || "month"}
                    units={filters.units}
                    comparable={filters.comparable}
                    chartData={series.chartData}
                    seriesKeys={series.seriesKeys}
                    headlineLabel={series.headlineLabel}
                    headlineTotal={series.headlineTotal}
                    comparableLabel={series.comparableLabel}
                    comparableTotal={series.comparableTotal}
                    budgetPayload={budgetData}
                    rows={data.series}
                  />
                ) : null}
              </TabsContent>
            );
          })
        )}
      </Tabs>
    </div>
  );
}
