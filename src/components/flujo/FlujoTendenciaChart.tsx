"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { ChartInsightCopy } from "@/components/charts/ChartInsightCopy";
import { ComposedCashChart } from "@/components/charts/ComposedCashChart";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import { buildFlujoTendencia, type FlujoMensual } from "@/services/flujoTransformer";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { useMemo, useRef } from "react";

export function FlujoTendenciaChart({
  periodo, units, rows,
}: { periodo: string; units: DisplayUnits; rows: FlujoMensual[] }) {
  const { tenantId, tenants, user } = useSession();
  const { t } = useLocale();
  const chartRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildFlujoTendencia(rows, periodo, units), [rows, periodo, units]);
  const tenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");
  const insightText = model.insight ? t(model.insight.messageKey, model.insight.values) : "";

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-sans text-lg font-medium text-foreground">{t("flujo.netCashFlow")}</h3>
          <span className="text-sm text-muted-foreground">{t("flujo.monthlyTrend")}</span>
        </div>
        <ChartDownloadButton
          targetRef={chartRef}
          empresa={tenantName}
          modulo="flujo"
          titulo={t("flujo.netCashFlow")}
          periodo={periodo}
        />
      </div>

      <div ref={chartRef} className="h-[320px] w-full min-w-0">
        <ComposedCashChart
          chartKey={`${periodo}-${units}`}
          data={model.points}
          yTickFormatter={(value) => formatAxisTick(value, units)}
          tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
        />
      </div>

      {model.insight ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              model.insight.favorable ? "" : "bg-desfavorable",
            )}
            style={model.insight.favorable ? { backgroundColor: "var(--cifra-good)" } : undefined}
            aria-hidden
          />
          <p className="min-w-0 flex-1">{insightText}</p>
          <ChartInsightCopy
            frase={insightText}
            chartName={t("flujo.netCashFlow")}
            empresa={tenantName}
            periodo={periodo}
          />
        </div>
      ) : null}
    </article>
  );
}
