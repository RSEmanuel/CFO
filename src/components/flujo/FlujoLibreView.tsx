"use client";

import { ExpandableShell } from "@/components/charts/ExpandableChartCard";
import { DataEmptyState } from "@/components/data-empty-state";
import { useLocale } from "@/context/LocaleContext";
import { useFlujoLibre } from "@/hooks/use-flujo-libre";
import { CHART, CHART_AXIS, WATERFALL_TONE, waterfallFigureColor } from "@/lib/chart-theme";
import type { FlujoLibreKind, FlujoLibreStep } from "@/services/flujoLibre";
import { cn } from "@/lib/utils";
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

const TICK_FONT_SIZE = 14;
const TICK_CHAR_WIDTH = 8.2;
const TICK_LINE_HEIGHT = 17;
const TICK_MAX_LINES = 5;
/** Si la palabra más larga no cabe en su barra a TICK_FONT_SIZE, la etiqueta baja hasta este tamaño. */
const TICK_MIN_FONT_SIZE = 10;

/** Parte la etiqueta en renglones que caben en el ancho de su barra, para que no se encimen. */
function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  if (lines.length > TICK_MAX_LINES) {
    const kept = lines.slice(0, TICK_MAX_LINES);
    kept[TICK_MAX_LINES - 1] = `${kept[TICK_MAX_LINES - 1]}…`;
    return kept;
  }
  return lines;
}

function WaterfallXTick({
  x,
  y,
  payload,
  width,
  visibleTicksCount,
  longestWord = 1,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  width?: number;
  visibleTicksCount?: number;
  /** Palabra más larga de todas las etiquetas: fija un solo tamaño de letra para todo el eje. */
  longestWord?: number;
}) {
  const band = width && visibleTicksCount ? width / visibleTicksCount : 120;
  const label = String(payload?.value ?? "");
  // El wrap no parte palabras: en barras angostas se achica la letra (igual en todo el eje) hasta que la palabra más larga quepa.
  const scale = Math.max(
    TICK_MIN_FONT_SIZE / TICK_FONT_SIZE,
    Math.min(1, (band - 6) / (longestWord * TICK_CHAR_WIDTH)),
  );
  const fontSize = TICK_FONT_SIZE * scale;
  const maxChars = Math.max(6, Math.floor((band - 6) / (TICK_CHAR_WIDTH * scale)));
  const lines = wrapLabel(label, maxChars);
  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--cifra-ink-3)" fontSize={fontSize} fontWeight={500} fontFamily="var(--cifra-font-sans)">
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 14 : TICK_LINE_HEIGHT * scale}>
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
  const longestWord = useMemo(
    () => Math.max(1, ...rows.flatMap((row) => row.label.split(/\s+/).map((word) => word.length))),
    [rows],
  );

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
    <ExpandableShell className="p-5">
      {(toggle, expanded) => (
        <>
          <div className="mb-1 flex items-start justify-between gap-3">
            <h3 className="font-sans text-lg font-medium text-foreground">{t("flujo.libre.title")}</h3>
            {toggle}
          </div>

          <div className={cn("mt-4 w-full min-w-0", expanded ? "min-h-0 flex-1" : "h-[440px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 28, right: 12, left: 8, bottom: 8 }}>
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={<WaterfallXTick longestWord={longestWord} />}
                  axisLine={{ stroke: CHART_AXIS.stroke }}
                  tickLine={false}
                  height={14 + TICK_LINE_HEIGHT * TICK_MAX_LINES}
                />
                <YAxis
                  width={72}
                  tick={{ fill: CHART_AXIS.tick, fontSize: 12, fontFamily: "var(--cifra-font-mono)" }}
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
                          fontFamily="var(--cifra-font-mono)"
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
        </>
      )}
    </ExpandableShell>
  );
}
