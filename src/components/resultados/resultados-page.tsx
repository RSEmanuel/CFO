"use client";

import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { TendenciaIngresosCostosChart } from "@/components/dashboard/TendenciaIngresosCostosChart";
import { EstadoOperativoCard } from "@/components/resultados/EstadoOperativoCard";
import { ResultadosCategoryView } from "@/components/resultados/ResultadosCategoryView";
import { DestacadosRubroCard, rubroTitleKey } from "@/components/resultados/DestacadosRubroCard";
import { EstadoResultadosView } from "@/components/resultados/EstadoResultadosView";
import { ResultadosPresupuestoView } from "@/components/resultados/ResultadosPresupuestoView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataEmptyState } from "@/components/data-empty-state";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useBudgetProjection } from "@/hooks/use-budget-projection";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { useResultados } from "@/hooks/use-resultados";
import { cn } from "@/lib/utils";
import { buildStackedSeries, getDestacadosKpis, type ResultadosCategoryName } from "@/services/financialDataTransformer";
import { buildUtilidadRubro, comparableShift, shiftPeriodo } from "@/services/utilidadRubro";
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
  { value: "presupuesto", labelKey: "resultados.tabBudget" },
] as const;

const DEFAULT_RESULTADOS_TAB = "ingreso";

const CATEGORY_TABS: Record<string, ResultadosCategoryName> = {
  ingreso: "Ingreso",
  costo: "Costo",
  gasto: "Gasto",
};

const ESTADO_RUBRO_ORDER = ["ingreso", "costo", "gasto", "utilidad", "ebitda"] as const;

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
    if (fromUrl === "destacados" || fromUrl === "resultados" || fromUrl === "otras") {
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
  const cardPeriod = filters.periodo || data?.availablePeriods.at(-1) || activePeriod || "";
  const priorShift = comparableShift(kpis.contextLabel);
  const priorPeriod = priorShift == null ? cardPeriod : shiftPeriodo(cardPeriod, priorShift);
  const { data: estadoActual } = useEstadoOperativo(cardPeriod);
  const { data: estadoPrior } = useEstadoOperativo(priorPeriod);
  const estadoRubros = useMemo(() => {
    const utilidad = buildUtilidadRubro(estadoActual, estadoPrior, kpis.contextLabel);
    return ESTADO_RUBRO_ORDER.flatMap((key) => {
      if (key === "utilidad") return [utilidad];
      const rubro = kpis.rubros.find((item) => item.key === key);
      return rubro ? [rubro] : [];
    });
  }, [estadoActual, estadoPrior, kpis]);

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
          value: rubro.value ?? 0,
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
          <TabsList className="flex h-auto flex-nowrap justify-start gap-2 overflow-x-auto border-0 bg-transparent p-0 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
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
              </div>
            }
          />
        </div>

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
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                      {estadoRubros.map((rubro) => (
                        <DestacadosRubroCard
                          key={rubro.key}
                          rubro={rubro}
                          units={filters.units}
                          contextLabel={kpis.contextLabel}
                        />
                      ))}
                    </div>
                    <EstadoResultadosView periodo={effectivePeriod} />
                  </div>
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
                    <TendenciaIngresosCostosChart
                      rows={data.series}
                      units={filters.units}
                      endPeriod={effectivePeriod}
                    />
                    <EstadoOperativoCard periodo={effectivePeriod} />
                  </div>
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
