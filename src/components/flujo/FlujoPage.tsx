"use client";

import { FlujoAlertas } from "@/components/flujo/FlujoAlertas";
import { FlujoDinamicaDiariaView, FlujoResumenKpis } from "@/components/flujo/FlujoOperativoView";
import { FlujoEfectivoView } from "@/components/flujo/FlujoEfectivoView";
import { FlujoLibreView } from "@/components/flujo/FlujoLibreView";
import {
  INITIAL_RESULTADOS_FILTERS,
  ResultadosFilterBar,
  type ResultadosFilters,
} from "@/components/resultados/resultados-filter-bar";
import { DataEmptyState } from "@/components/data-empty-state";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { useFlujo } from "@/hooks/use-flujo";
import { useEffect, useState } from "react";

export function FlujoPage() {
  const { t } = useLocale();
  const { activePeriod, availablePeriods, selectPeriod } = useSession();
  const { data, loading, error } = useFlujo();
  const [filters, setFilters] = useState<ResultadosFilters>({ ...INITIAL_RESULTADOS_FILTERS, periodo: "" });

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
      <p className="text-2xl font-bold tracking-tight text-clay">{t("nav.cashflow")}</p>

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

      <div className="mt-4 space-y-4">
        <FlujoAlertas periodo={effectivePeriod} rows={data?.rows ?? []} />
        <FlujoResumenKpis periodo={effectivePeriod} />
        <FlujoEfectivoView periodo={effectivePeriod} units={filters.units} />
        <FlujoLibreView periodo={effectivePeriod} units={filters.units} />
        <FlujoDinamicaDiariaView periodo={effectivePeriod} units={filters.units} />
      </div>
    </div>
  );
}
