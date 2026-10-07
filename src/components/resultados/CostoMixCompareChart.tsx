"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { ChartInsightCopy } from "@/components/charts/ChartInsightCopy";
import { HeroBarChart, TIME_COMPARE_COLORS } from "@/components/charts/HeroBarChart";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import { buildCostoMixCompare, type CostoMixMode } from "@/services/resultadosDeepDive";
import { useMemo, useRef, useState } from "react";

const MODE_OPTIONS: Array<{ value: CostoMixMode; labelKey: string }> = [
  { value: "mom", labelKey: "resultados.mom" },
  { value: "qoq", labelKey: "resultados.qoq" },
  { value: "yoy", labelKey: "resultados.yoy" },
];

export function CostoMixCompareChart({
  periodo,
  rows,
}: {
  periodo: string;
  rows: MonthlyFinancials[];
}) {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const chartRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CostoMixMode>("mom");
  const model = useMemo(() => buildCostoMixCompare(rows, periodo, mode), [rows, periodo, mode]);
  const insightText = model.insight
    ? t(model.insight.messageKey, {
        ...model.insight.values,
        verb: t(String(model.insight.values.verb)),
      })
    : null;
  const hasPrior = model.priorLabel != null;
  const tenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  const chartData = model.rows.map((row) => ({
    name: row.label,
    prior: row.priorPct ?? 0,
    actual: row.actualPct ?? 0,
    priorPct: row.priorPct,
    actualPct: row.actualPct,
  }));

  const series = [
    ...(hasPrior ? [{ dataKey: "prior", name: "prior", fill: TIME_COMPARE_COLORS.prior }] : []),
    { dataKey: "actual", name: "actual", fill: TIME_COMPARE_COLORS.actual },
  ];

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-sans text-lg font-medium text-foreground">{t("resultados.costVsIncome")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={cn(
                  "h-9 min-w-9 rounded-control px-3 text-sm font-medium transition-colors",
                  mode === option.value
                    ? "bg-secondary text-clay shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={mode === option.value}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
          <ChartDownloadButton
            targetRef={chartRef}
            empresa={tenantName}
            modulo="resultados"
            titulo={t("resultados.costVsIncome")}
            periodo={periodo}
          />
        </div>
      </div>

      <div ref={chartRef} className="h-[320px] w-full min-w-0">
        <HeroBarChart
          chartKey={`${periodo}-${mode}`}
          data={chartData}
          xKey="name"
          yTickFormatter={(value) => `${value}%`}
          tooltipFormatter={(value, name) => {
            const numeric = Number(value);
            const label = name === "actual" ? model.actualLabel : (model.priorLabel ?? "—");
            return [Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "—", label];
          }}
          legendFormatter={(value) => (value === "actual" ? model.actualLabel : (model.priorLabel ?? "—"))}
          series={series}
          showValueLabels
          valueLabelFormatter={(_value, dataKey, payload) => {
            const raw = dataKey === "prior" ? payload.priorPct : payload.actualPct;
            if (typeof raw !== "number") {
              return "—";
            }
            return `${raw.toFixed(1)}%`;
          }}
        />
      </div>

      {model.insight && insightText ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={cn("inline-block h-2 w-2 shrink-0 rounded-full", model.insight.favorable ? "bg-favorable" : "bg-chart-ochre")}
            style={model.insight.favorable ? { backgroundColor: "var(--cifra-good)" } : undefined}
            aria-hidden
          />
          <p className="min-w-0 flex-1">{insightText}</p>
          <ChartInsightCopy
            frase={insightText}
            chartName={t("resultados.costVsIncome")}
            empresa={tenantName}
            periodo={periodo}
          />
        </div>
      ) : null}
    </article>
  );
}
