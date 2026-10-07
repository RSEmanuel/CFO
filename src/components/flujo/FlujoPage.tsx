"use client";

import { FlujoDinamicaDiariaView, FlujoResumenKpis } from "@/components/flujo/FlujoOperativoView";
import { FlujoEfectivoView } from "@/components/flujo/FlujoEfectivoView";
import { FlujoLibreView } from "@/components/flujo/FlujoLibreView";
import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataEmptyState } from "@/components/data-empty-state";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useFlujo } from "@/hooks/use-flujo";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const FLUJO_TABS = [
  { value: "vision", labelKey: "flujo.tabs.vision" },
  { value: "libre", labelKey: "flujo.tabs.libre" },
  { value: "diaria", labelKey: "flujo.tabs.diaria" },
] as const;

type FlujoTab = (typeof FLUJO_TABS)[number]["value"];

const DEFAULT_FLUJO_TAB: FlujoTab = "vision";

const LEGACY_TABS: Record<string, FlujoTab> = {
  efectivo: "vision",
  resumen: "vision",
  actividades: "vision",
  operativo: "diaria",
  vision: "vision",
  libre: "libre",
  diaria: "diaria",
};

export function FlujoPage() {
  const { t } = useLocale();
  const { activePeriod, availablePeriods, selectPeriod } = useSession();
  const { data, loading, error } = useFlujo();
  const [tab, setTab] = useState<FlujoTab>(DEFAULT_FLUJO_TAB);
  const [filters, setFilters] = useState<ResultadosFilters>({ ...INITIAL_RESULTADOS_FILTERS, periodo: "" });

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    const next = (fromUrl && LEGACY_TABS[fromUrl]) || DEFAULT_FLUJO_TAB;
    setTab(next);
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== next) {
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    setFilters((current) => ({ ...current, periodo: activePeriod ?? data?.latestPeriod ?? "" }));
  }, [activePeriod, data?.latestPeriod]);

  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  if (error) return <DataEmptyState title={t("flujo.loadError")} message={error} />;

  const treasuryPeriods = data?.rows.map((row) => row.periodo) ?? [];
  const periodOptions = treasuryPeriods.length > 0 ? treasuryPeriods : availablePeriods;
  const effectivePeriod = filters.periodo || data?.latestPeriod || activePeriod || "";

  return (
    <div className="mx-auto w-full max-w-[1680px] bg-background">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as FlujoTab;
          setTab(next);
          const url = new URL(window.location.href);
          url.searchParams.set("tab", next);
          window.history.replaceState({}, "", url);
        }}
      >
        <div>
          <p className="mb-2 text-lg font-bold tracking-tight text-clay">{t("nav.cashflow")}</p>
          <TabsList className="flex h-auto flex-nowrap justify-start gap-2 overflow-x-auto border-0 bg-transparent p-0 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
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
            availablePeriods={periodOptions}
            onChange={(next) => {
              setFilters(next);
              if (next.periodo !== filters.periodo) selectPeriod(next.periodo);
            }}
          />
        </div>

        <TabsContent value="vision" className="mt-4 space-y-4">
          <FlujoResumenKpis periodo={effectivePeriod} />
          <FlujoEfectivoView periodo={effectivePeriod} units={filters.units} />
        </TabsContent>
        <TabsContent value="libre" className="mt-4">
          <FlujoLibreView periodo={effectivePeriod} units={filters.units} />
        </TabsContent>
        <TabsContent value="diaria" className="mt-4">
          <FlujoDinamicaDiariaView periodo={effectivePeriod} units={filters.units} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
