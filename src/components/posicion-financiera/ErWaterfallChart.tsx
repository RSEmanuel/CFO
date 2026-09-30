"use client";

import { useLocale } from "@/context/LocaleContext";
import { CHART_VARS } from "@/lib/chart-theme";
import {
  buildErWaterfall,
  extractErWaterfallInput,
  toErWaterfallRows,
  type ErWaterfallKind,
} from "@/lib/posicion-financiera/erWaterfall";
import { formatCompactAxis, formatMxn } from "@/services/money";
import type { StatementNode } from "@/services/posicionFinanciera";
import { useMemo } from "react";
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

/** Semántica ingreso/costo (misma paleta local que Ingresos vs costos). */
const FILL_FAVORABLE = "#10B981";
const FILL_UNFAVORABLE = "#EF4444";

function stepFill(kind: ErWaterfallKind): string {
  if (kind === "increase") {
    return FILL_FAVORABLE;
  }
  if (kind === "decrease") {
    return FILL_UNFAVORABLE;
  }
  return CHART_VARS.text;
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
      fill={CHART_VARS.mute}
      fontSize={12}
      fontWeight={500}
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 12 : 15}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

type ChartRow = ReturnType<typeof toErWaterfallRows>[number] & { label: string };

function WaterfallTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  const { t } = useLocale();
  if (!active || !payload?.[0]?.payload) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div className="rounded-control border border-border bg-card px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      <p className="text-muted-foreground">{row.label}</p>
      <p className="financial-nums mt-0.5 font-medium text-foreground">{formatMxn(row.value)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("posicionFinanciera.waterfall.amount")}</p>
    </div>
  );
}

type ErWaterfallChartProps = {
  nodes: StatementNode[];
  yearKey: string;
  loading?: boolean;
  empty?: boolean;
};

export function ErWaterfallChart({ nodes, yearKey, loading, empty }: ErWaterfallChartProps) {
  const { t } = useLocale();
  const model = useMemo(() => {
    const extracted = extractErWaterfallInput(nodes, yearKey);
    return extracted ? buildErWaterfall(extracted) : null;
  }, [nodes, yearKey]);
  const data = useMemo(
    () => (model ? toErWaterfallRows(model).map((row) => ({ ...row, label: t(row.labelKey) })) : []),
    [model, t],
  );

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-clay">
          {t("posicionFinanciera.waterfall.eyebrow")}
        </p>
        <h2 className="mt-1 font-serif text-xl font-medium tracking-tight text-foreground">
          {t("posicionFinanciera.waterfall.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("posicionFinanciera.waterfall.help")}</p>
      </div>
      <div className="mt-4 w-full min-w-0">
        {loading ? (
          <div className="h-[320px] animate-pulse rounded-card bg-muted" />
        ) : empty || !model || data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("posicionFinanciera.waterfall.empty")}
          </p>
        ) : (
          <>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 28, right: 8, left: 8, bottom: 48 }}>
                  <XAxis
                    dataKey="label"
                    interval={0}
                    height={48}
                    tick={<WaterfallXTick />}
                    axisLine={{ stroke: CHART_VARS.axis }}
                    tickLine={false}
                  />
                  <YAxis
                    width={64}
                    tick={{ fill: CHART_VARS.mute, fontSize: 12, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => formatCompactAxis(value)}
                    className="financial-nums"
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={<WaterfallTooltip />}
                  />
                  <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" tooltipType="none" maxBarSize={64} />
                  <Bar dataKey="amount" stackId="wf" radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {data.map((row) => (
                      <Cell key={row.id} fill={stepFill(row.kind)} />
                    ))}
                    <LabelList
                      position="top"
                      fill={CHART_VARS.text}
                      fontSize={11}
                      fontWeight={600}
                      valueAccessor={(entry) => {
                        const payload = (entry.payload ?? {}) as { value?: number };
                        return typeof payload.value === "number" ? formatCompactAxis(payload.value) : "";
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FILL_FAVORABLE }} />
                {t("posicionFinanciera.waterfall.legend.increase")}
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FILL_UNFAVORABLE }} />
                {t("posicionFinanciera.waterfall.legend.decrease")}
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART_VARS.text }} />
                {t("posicionFinanciera.waterfall.legend.total")}
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
