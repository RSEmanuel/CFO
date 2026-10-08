"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { DataEmptyState } from "@/components/data-empty-state";
import { useLocale } from "@/context/LocaleContext";
import { useFlujoLibre } from "@/hooks/use-flujo-libre";
import { CHART, CHART_AXIS, WATERFALL_TONE, waterfallFigureColor } from "@/lib/chart-theme";
import type { FlujoLibreKind, FlujoLibreStep } from "@/services/flujoLibre";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import { useMemo } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

type ChartRow = {
  label: string;
  kind: FlujoLibreKind;
  signed: number;
  base: number;
  amount: number;
};

/** Entra dinero en verde, sale en rojo; el total va en azul o en rojo si es negativo. */
function kindColor(kind: FlujoLibreKind, signed: number): string {
  if (kind === "total") {
    return signed < 0 ? WATERFALL_TONE.loss : WATERFALL_TONE.profit;
  }
  return signed < 0 ? WATERFALL_TONE.loss : WATERFALL_TONE.gain;
}

type LibreLabelGeom = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  index?: number;
};

function toChartRows(steps: FlujoLibreStep[], t: (key: string) => string): ChartRow[] {
  let running = 0;
  return steps.map((step) => {
    const label = t(step.labelKey);
    if (step.kind === "total") {
      running = step.value;
      return { label, kind: step.kind, signed: step.value, base: 0, amount: step.value };
    }
    if (step.kind === "increase") {
      const base = running;
      running += step.value;
      return { label, kind: step.kind, signed: step.value, base, amount: step.value };
    }
    const base = running - step.value;
    running -= step.value;
    return { label, kind: step.kind, signed: -step.value, base, amount: step.value };
  });
}

function splitLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return [label];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
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
  const lines = splitLabel(String(payload?.value ?? ""));
  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--cifra-ink-3)" fontSize={12} fontWeight={500}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 14 : 15}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function FlujoLibreView({ periodo, units }: { periodo: string; units: DisplayUnits }) {
  const { t } = useLocale();
  const { data, loading, error } = useFlujoLibre(periodo);
  const rows = useMemo(() => (data ? toChartRows(data.steps, t) : []), [data, t]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  }
  if (error) {
    return <DataEmptyState title={t("flujo.libre.loadError")} message={error} />;
  }
  if (!data?.hasBalanza || !data.hasPrior || data.steps.length < 2) {
    return (
      <DataEmptyState
        title={t("flujo.libre.emptyTitle")}
        message={t(data?.hasBalanza ? "flujo.libre.emptyPriorMessage" : "flujo.libre.emptyMessage")}
      />
    );
  }

  return (
    <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-1 flex items-center gap-2">
        <CifraMark state="estimated" size={18} className="text-muted-foreground" />
        <h3 className="font-sans text-lg font-medium text-foreground">{t("flujo.libre.title")}</h3>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("flujo.libre.subtitle")}</p>

      <div className="mt-4 h-[440px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 12, left: 8, bottom: 36 }}>
            <XAxis
              dataKey="label"
              interval={0}
              tick={<WaterfallXTick />}
              axisLine={{ stroke: CHART_AXIS.stroke }}
              tickLine={false}
              height={56}
            />
            <YAxis
              width={72}
              tick={{ fill: CHART_AXIS.tick, fontSize: 12, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatAxisTick(value, units)}
            />
            <Tooltip
              cursor={{ fill: "rgb(21 80 224 / 0.06)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, _name, item) => {
                const payload = item?.payload as { signed?: number } | undefined;
                const signed = typeof payload?.signed === "number" ? payload.signed : Number(value);
                return [
                  <span key="monto" className="financial-nums" style={{ color: waterfallFigureColor(signed, "inherit") }}>
                    {formatMxn(signed)}
                  </span>,
                  t("flujo.efectivo.monto"),
                ];
              }}
            />
            <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" tooltipType="none" maxBarSize={72} />
            <Bar dataKey="amount" stackId="wf" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.label} fill={kindColor(row.kind, row.signed)} />
              ))}
              <LabelList
                position="top"
                content={({ x, y, width, index }: LibreLabelGeom) => {
                  const row = index == null ? undefined : rows[index];
                  if (!row) return null;
                  return (
                    <text
                      x={Number(x ?? 0) + Number(width ?? 0) / 2}
                      y={Number(y ?? 0) - 6}
                      textAnchor="middle"
                      fill={waterfallFigureColor(row.signed, "var(--cifra-ink-2)")}
                      fontSize={11}
                      fontFamily="var(--font-mono)"
                      className="financial-nums"
                    >
                      {row.signed < 0 ? `-${formatAxisTick(-row.signed, units)}` : formatAxisTick(row.signed, units)}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{t("flujo.libre.estimated")}</p>
      {data.insight ? (
        <p className="mt-2 text-sm text-foreground">
          {t(`flujo.libre.insight.${data.insight.bucket}.${data.insight.direction}`, {
            amount: formatMxn(data.insight.amount),
          })}
        </p>
      ) : null}
    </article>
  );
}
