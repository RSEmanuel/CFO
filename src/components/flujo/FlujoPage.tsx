"use client";

import { FlujoActividadesView } from "@/components/flujo/FlujoActividadesView";
import { FlujoAlertas } from "@/components/flujo/FlujoAlertas";
import { FlujoEfectivoView } from "@/components/flujo/FlujoEfectivoView";
import { FlujoOperativoView } from "@/components/flujo/FlujoOperativoView";
import { FlujoTendenciaChart } from "@/components/flujo/FlujoTendenciaChart";
import { FlujoWaterfallChart } from "@/components/flujo/FlujoWaterfallChart";
import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataEmptyState } from "@/components/data-empty-state";
import { DataOriginBadge } from "@/components/data-origin-badge";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useFlujo } from "@/hooks/use-flujo";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const FLUJO_TABS = [
  { value: "efectivo", labelKey: "flujo.efectivo.tab" },
  { value: "resumen", labelKey: "flujo.summary" },
  { value: "actividades", labelKey: "flujo.activityFamilies" },
  { value: "operativo", labelKey: "flujo.operativo.tab" },
] as const;

export function FlujoPage() {
  const { t } = useLocale();
  const { activePeriod, selectPeriod } = useSession();
  const { data, loading, error } = useFlujo();
  const [tab, setTab] = useState<(typeof FLUJO_TABS)[number]["value"]>("efectivo");
  const [filters, setFilters] = useState<ResultadosFilters>({ ...INITIAL_RESULTADOS_FILTERS, periodo: "" });
  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? data?.latestPeriod ?? "" }));
  }, [activePeriod, data?.latestPeriod]);

  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  if (error) return <DataEmptyState title={t("flujo.loadError")} message={error} />;
  if (!data?.hasData) {
    return (
      <DataEmptyState
        title={t("flujo.emptyTitle")}
        message={t("flujo.emptyMessage")}
      />
    );
  }

  const effectivePeriod = filters.periodo || data.latestPeriod || "";
  const periodHasData = !effectivePeriod || data.rows.some((row) => row.periodo === effectivePeriod);

  return (
    <div className="mx-auto w-full max-w-[1680px] bg-background">
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <div>
          <p className="mb-2 text-lg font-bold tracking-tight text-clay">{t("nav.cashflow")}</p>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 border-0 bg-transparent p-0">
            {FLUJO_TABS.map((item) => (
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
            availablePeriods={data.rows.map((row) => row.periodo)}
            onChange={(next) => {
              setFilters(next);
              if (next.periodo !== filters.periodo) selectPeriod(next.periodo);
            }}
            trailing={<DataOriginBadge origin={data.periodOrigins[effectivePeriod]} />}
          />
        </div>

        {!periodHasData ? (
          <div className="mt-4">
            <DataEmptyState
              title={t("flujo.emptyPeriodTitle", { periodo: effectivePeriod })}
              message={t("flujo.emptyPeriodMessage")}
            />
          </div>
        ) : (
          <>
            <TabsContent value="efectivo" className="mt-4">
              <FlujoEfectivoView
                periodo={effectivePeriod}
                units={filters.units}
              />
            </TabsContent>
            <TabsContent value="resumen" className="mt-4">
              <div className="space-y-4">
                <FlujoAlertas periodo={filters.periodo} rows={data.rows} />
                <FlujoTendenciaChart periodo={filters.periodo} units={filters.units} rows={data.rows} />
                <FlujoWaterfallChart periodo={filters.periodo} units={filters.units} rows={data.rows} />
              </div>
            </TabsContent>
            <TabsContent value="actividades" className="mt-4">
              <FlujoActividadesView periodo={filters.periodo} units={filters.units} rows={data.rows} />
            </TabsContent>
            <TabsContent value="operativo" className="mt-4">
              <FlujoOperativoView periodo={effectivePeriod} units={filters.units} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
