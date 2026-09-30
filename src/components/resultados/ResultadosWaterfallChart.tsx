"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { InsightText } from "@/components/insight-text";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import { getDestacadosPeriodTotals, type MonthlyFinancials } from "@/services/financialDataTransformer";
import { formatAxisTick, type DisplayUnits } from "@/services/money";
import {
  buildResultadosWaterfall,
  pctOfIncome,
  toWaterfallRows,
  type ResultadosWaterfallKind,
} from "@/services/resultadosWaterfall";
import { useMemo, useRef } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS_LABEL = "#1A1915";

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

function stepColor(kind: ResultadosWaterfallKind): string {
  if (kind === "increase") {
    return CHART.olive;
  }
  if (kind === "total") {
    return CHART.clay;
  }
  if (kind === "subtotal") {
    return CHART.olive;
  }
  return CHART.coral;
}

function formatValue(value: number, units: DisplayUnits): string {
  return formatAxisTick(value, units);
}

function splitAxisLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return [label];
  }
  return [words[0], words.slice(1).join(" ")];
}

function WaterfallXTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const lines = splitAxisLabel(String(payload?.value ?? ""));
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={AXIS_LABEL}
      fontSize={13}
      fontWeight={500}
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 12 : 16}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function ResultadosWaterfallChart({
  filters,
  rows,
  insightText,
}: {
  filters: ResultadosFilters;
  rows: MonthlyFinancials[];
  /** Qué mide la cascada. Si se omite, usa resultados.waterfallHelp. */
  insightText?: string;
}) {
  const { t } = useLocale();
  const { tenantId, tenants, user } = useSession();
  const chartRef = useRef<HTMLDivElement>(null);
  const totals = useMemo(() => getDestacadosPeriodTotals(rows, filters), [rows, filters]);
  const model = useMemo(() => buildResultadosWaterfall(totals), [totals]);
  const data = useMemo(
    () =>
      model
        ? toWaterfallRows(model).map((row) => ({ ...row, label: t(row.labelKey) }))
        : [],
    [model, t],
  );
  const ingresoTotal = totals.ingreso_total;
  const tenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  return (
    <section className="w-full rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl font-medium text-foreground">
              {t("resultados.waterfallTitle")}
            </h2>
            <FavoriteStarButton widgetId="chart-resultados-waterfall" label={t("resultados.waterfallTitle")} />
          </div>
          <InsightText text={insightText ?? t("resultados.waterfallHelp")} />
        </div>
        <ChartDownloadButton
          targetRef={chartRef}
          empresa={tenantName}
          modulo="resultados"
          titulo={t("resultados.waterfallTitle")}
          periodo={filters.periodo}
        />
      </div>
      <div ref={chartRef} className="mt-4 w-full min-w-0">
        {model ? (
          <div className="w-full">
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={`${filters.periodo}-${filters.temporalidad}-${filters.units}`}
                  data={data}
                  margin={{ top: 36, right: 8, left: 8, bottom: 56 }}
                >
                  <XAxis
                    dataKey="label"
                    interval={0}
                    height={56}
                    tick={<WaterfallXTick />}
                    axisLine={{ stroke: CHART_AXIS.stroke }}
                    tickLine={false}
                  />
                  <YAxis
                    width={72}
                    tick={{ fill: AXIS_LABEL, fontSize: 13, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => formatAxisTick(value, filters.units)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as { value?: number } | undefined;
                      const raw = typeof payload?.value === "number" ? payload.value : Number(value);
                      const pct = pctOfIncome(raw, ingresoTotal);
                      const pctLabel = pct == null ? "" : ` (${pct.toFixed(1)}%)`;
                      return [`${formatValue(raw, filters.units)}${pctLabel}`, t("pdf.amount")];
                    }}
                  />
                  <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" tooltipType="none" maxBarSize={72} />
                  <Bar dataKey="amount" stackId="wf" name={t("pdf.amount")} radius={[4, 4, 0, 0]} maxBarSize={72}>
                    {data.map((row) => (
                      <Cell key={row.id} fill={stepColor(row.kind)} />
                    ))}
                    <LabelList
                      position="top"
                      fill={AXIS_LABEL}
                      fontSize={12}
                      fontWeight={600}
                      valueAccessor={(entry) => {
                        const payload = (entry.payload ?? {}) as { value?: number };
                        return typeof payload.value === "number"
                          ? formatValue(payload.value, filters.units)
                          : "";
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap items-center justify-start gap-x-6 gap-y-3 text-sm font-medium text-foreground">
              <li className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CHART.olive }} />
                {t("resultados.waterfallLegend.increase")}
              </li>
              <li className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CHART.coral }} />
                {t("resultados.waterfallLegend.decrease")}
              </li>
              <li className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CHART.clay }} />
                {t("resultados.waterfallLegend.total")}
              </li>
            </ul>
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("resultados.waterfallError")}
          </p>
        )}
      </div>
    </section>
  );
}
