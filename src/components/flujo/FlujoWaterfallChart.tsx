"use client";

import { ChartDownloadButton } from "@/components/charts/ChartDownloadButton";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { CHART, CHART_AXIS, WATERFALL_TONE, waterfallFigureColor } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import {
  buildFlujoWaterfall,
  type FlujoMensual,
  type FlujoWaterfallStep,
  type FlujoWaterfallWindow,
} from "@/services/flujoTransformer";
import { formatAxisTick, type DisplayUnits } from "@/services/money";
import { useMemo, useRef, useState } from "react";
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

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

const WINDOW_OPTIONS: Array<{ value: FlujoWaterfallWindow; labelKey: string }> = [
  { value: "month", labelKey: "filters.month" },
  { value: "quarter", labelKey: "filters.quarter" },
];

/** Entra dinero en verde, sale en rojo; el saldo va en azul o en rojo si es negativo. */
function kindColor(kind: FlujoWaterfallStep["kind"], value: number): string {
  if (kind === "increase") {
    return value < 0 ? WATERFALL_TONE.loss : WATERFALL_TONE.gain;
  }
  if (kind === "decrease") {
    return value < 0 ? WATERFALL_TONE.gain : WATERFALL_TONE.loss;
  }
  return value < 0 ? WATERFALL_TONE.loss : WATERFALL_TONE.profit;
}

function formatOneDecimal(value: number, units: DisplayUnits): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (units === "k") {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  }
  if (units === "m") {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
}

type FlujoLabelGeom = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  index?: number;
};

function toChartRows(steps: FlujoWaterfallStep[], t: (key: string) => string) {
  let running = 0;
  return steps.map((step) => {
    let base = 0;
    if (step.kind === "total") {
      base = 0;
      running = step.value;
    } else if (step.kind === "increase") {
      base = running;
      running = running + step.value;
    } else {
      base = running - step.value;
      running = running - step.value;
    }
    return {
      label: step.labelKey ? t(step.labelKey) : step.label,
      kind: step.kind,
      value: step.value,
      base,
      amount: step.value,
    };
  });
}

export function FlujoWaterfallChart({
  periodo, units, rows,
}: { periodo: string; units: DisplayUnits; rows: FlujoMensual[] }) {
  const { tenantId, tenants, user } = useSession();
  const { t } = useLocale();
  const chartRef = useRef<HTMLDivElement>(null);
  const [windowMode, setWindowMode] = useState<FlujoWaterfallWindow>("month");
  const model = useMemo(
    () => buildFlujoWaterfall(rows, periodo, windowMode, units),
    [rows, periodo, windowMode, units],
  );
  const data = toChartRows(model.steps, t);
  const tenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.name ??
    (user?.tenant.id === tenantId ? user.tenant.name : undefined) ??
    t("resultados.companyFallback");

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-sans text-lg font-medium text-foreground">{t("flujo.historyTitle")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWindowMode(option.value)}
                className={cn(
                  "h-9 min-w-9 rounded-control px-3 text-sm font-medium transition-colors",
                  windowMode === option.value
                    ? "bg-secondary text-clay shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={windowMode === option.value}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
          <ChartDownloadButton
            targetRef={chartRef}
            empresa={tenantName}
            modulo="flujo"
            titulo={t("flujo.historyTitle")}
            periodo={periodo}
          />
        </div>
      </div>

      <div ref={chartRef} className="h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart key={`${periodo}-${windowMode}-${units}`} data={data} margin={{ top: 28, right: 8, left: 8, bottom: 8 }}>
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
              axisLine={{ stroke: CHART_AXIS.stroke }}
              tickLine={false}
            />
            <YAxis
              width={64}
              tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatAxisTick(value, units)}
            />
            <Tooltip
              cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, _name, item) => {
                const payload = item?.payload as { value?: number } | undefined;
                const raw = typeof payload?.value === "number" ? payload.value : Number(value);
                return [
                  <span key="monto" className="financial-nums" style={{ color: waterfallFigureColor(raw, "inherit") }}>
                    {formatOneDecimal(raw, units)}
                  </span>,
                  t("pdf.amount"),
                ];
              }}
            />
            <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" tooltipType="none" maxBarSize={64} />
            <Bar dataKey="amount" stackId="wf" name={t("pdf.amount")} radius={[4, 4, 0, 0]} maxBarSize={64}>
              {data.map((row) => (
                <Cell key={row.label} fill={kindColor(row.kind, row.value)} />
              ))}
              <LabelList
                position="top"
                content={({ x, y, width, index }: FlujoLabelGeom) => {
                  const row = index == null ? undefined : data[index];
                  if (!row) return null;
                  return (
                    <text
                      x={Number(x ?? 0) + Number(width ?? 0) / 2}
                      y={Number(y ?? 0) - 6}
                      textAnchor="middle"
                      fill={waterfallFigureColor(row.value, CHART_AXIS.tick)}
                      fontSize={11}
                      className="financial-nums"
                    >
                      {formatOneDecimal(row.value, units)}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {model.insight ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              model.insight.favorable ? "" : "bg-desfavorable",
            )}
            style={model.insight.favorable ? { backgroundColor: "var(--cifra-good)" } : undefined}
            aria-hidden
          />
          {t(model.insight.messageKey, model.insight.values)}
        </p>
      ) : null}
    </article>
  );
}
