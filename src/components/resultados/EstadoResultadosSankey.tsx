"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { getDestacadosPeriodTotals, type MonthlyFinancials } from "@/services/financialDataTransformer";
import {
  generateSankeyData,
  sankeyChartHeight,
  type SankeyLimits,
} from "@/services/resultadosSankey";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";

const SankeyChart = dynamic(
  () => import("@/components/resultados/EstadoResultadosSankeyChart").then((mod) => mod.EstadoResultadosSankeyChart),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-control bg-secondary" />,
  },
);

type ResultadosSankeyProps = {
  filters: ResultadosFilters;
  rows: MonthlyFinancials[];
};

type DetailLevel = "summary" | "standard" | "detailed";

const DETAIL_LIMITS: Record<DetailLevel, SankeyLimits> = {
  summary: { income: 5, costs: 5, expenses: 5 },
  standard: { income: 8, costs: 8, expenses: 8 },
  detailed: { income: 12, costs: 12, expenses: 12 },
};

export function EstadoResultadosSankey({ filters, rows }: ResultadosSankeyProps) {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const chartRef = useRef<HTMLDivElement>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const totals = useMemo(() => getDestacadosPeriodTotals(rows, filters), [rows, filters]);
  const graph = useMemo(() => {
    try {
      return generateSankeyData(totals, DETAIL_LIMITS[detailLevel]);
    } catch (error) {
      console.error("generateSankeyData", error);
      return null;
    }
  }, [totals, detailLevel]);
  const chartHeight = useMemo(() => (graph ? sankeyChartHeight(graph) : 180), [graph]);
  const tenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  return (
    <section className="w-full rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-medium text-foreground">{t("resultados.sankeyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("resultados.sankeyHelp")}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <label className="block min-w-32">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("resultados.detail")}
            </span>
            <Select value={detailLevel} onValueChange={(value) => setDetailLevel(value as DetailLevel)}>
              <SelectTrigger className="h-9 w-32 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">{t("resultados.summary")}</SelectItem>
                <SelectItem value="standard">{t("resultados.standard")}</SelectItem>
                <SelectItem value="detailed">{t("resultados.detailed")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <ChartDownloadButton
            targetRef={chartRef}
            empresa={tenantName}
            modulo="resultados"
            titulo={t("resultados.sankeyTitle")}
            periodo={filters.periodo}
          />
        </div>
      </div>
      <div ref={chartRef} className="mt-4 w-full min-w-0" style={{ height: graph ? chartHeight : undefined }}>
        {graph ? (
          <SankeyChart graph={graph} units={filters.units} ingresoTotal={totals.ingreso_total} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("resultados.sankeyError")}</p>
        )}
      </div>
    </section>
  );
}
