"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { InsightText } from "@/components/insight-text";
import { useLocale } from "@/context/LocaleContext";
import { useResultadosTop5 } from "@/hooks/use-resultados-top5";
import { CHART, CHART_AXIS, TOP5_RESTO, TOP5_SERIES } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { formatAxisTick, formatCompactAxis, formatMxn, type DisplayUnits } from "@/services/money";
import {
  hasClampedResto,
  OTROS_KEY,
  stackedTooltipRows,
  stackTopKey,
  TOP5_STACK_ID,
  toTop5StackedPoints,
  top5ActiveMonthRows,
  type Top5ChartSeries,
  type Top5LegendRow,
  type Top5StackedPoint,
} from "@/services/resultadosTop5";
import { Users } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNarrowScreen } from "@/hooks/use-narrow-screen";

type ResultadosTop5ChartsProps = {
  periodo: string;
  units: DisplayUnits;
};

function seriesColor(index: number, key: string): string {
  return key === OTROS_KEY ? TOP5_RESTO : TOP5_SERIES[index % TOP5_SERIES.length];
}

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

function Top5Tooltip({
  active,
  payload,
  restLabel,
  entidades,
  includeResto,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload: Top5StackedPoint }>;
  restLabel: string;
  entidades: Top5ChartSeries["entidades"];
  includeResto: boolean;
  colors: Map<string, string>;
}) {
  const { t } = useLocale();
  if (!active || !payload?.length) {
    return null;
  }
  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }
  const rows = stackedTooltipRows(point, entidades, restLabel, includeResto).filter(
    (row) => Math.abs(row.monto) > 0.005,
  );
  return (
    <div className="min-w-[220px] px-3 py-2 text-xs" style={TOOLTIP_STYLE}>
      <p className="mb-1 font-medium text-foreground">{point.mes}</p>
      <p className="mb-2 financial-nums text-sm font-semibold text-foreground">
        {t("resultados.top5.tooltipTotal")} · {formatMxn(Number(point.totalMes))}
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colors.get(row.key) ?? TOP5_RESTO }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground" title={row.label}>
              {row.label}
            </span>
            <span className="financial-nums shrink-0 text-foreground">{formatMxn(row.monto)}</span>
            <span className="financial-nums w-12 shrink-0 text-right font-semibold tabular-nums">
              {row.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function totalMesLabel(value: unknown): string {
  const total = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(total) || Math.abs(total) <= 0.01) {
    return "";
  }
  return formatCompactAxis(total);
}

type LabelGeom = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
};

function num(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function TotalStackLabel(props: LabelGeom) {
  const text = typeof props.value === "string" ? props.value : totalMesLabel(props.value);
  if (!text) {
    return null;
  }
  return (
    <text
      x={num(props.x) + num(props.width) / 2}
      y={num(props.y)}
      textAnchor="middle"
      className="fill-slate-700 text-xs font-semibold financial-nums"
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
}

type PieLabelGeom = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number | string;
  payload?: Top5LegendRow;
};

const RADIAN = Math.PI / 180;

/** % del mes junto a cada rebanada; el nombre y el monto viven en la lista de abajo. */
function SlicePctLabel({ cx, cy, midAngle, outerRadius, payload }: PieLabelGeom) {
  if (cx == null || cy == null || midAngle == null || outerRadius == null || !payload || payload.pct < 3) {
    return null;
  }
  const radius = Number(outerRadius) + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill={CHART_AXIS.tick}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      className="financial-nums"
    >
      {`${payload.pct.toFixed(1)}%`}
    </text>
  );
}

function Top5PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Top5LegendRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) {
    return null;
  }
  return (
    <div className="min-w-[180px] px-3 py-2 text-xs" style={TOOLTIP_STYLE}>
      <p className="mb-1 font-medium text-foreground">{row.label}</p>
      <p className="financial-nums text-sm font-semibold text-foreground">
        {formatMxn(row.monto)} · {row.pct.toFixed(1)}%
      </p>
    </div>
  );
}

function Top5Card({
  title,
  insightText,
  series,
  rankingTotal,
  units,
  restLabel,
  emptyMessage,
  methodNote,
  favoriteId,
  variant = "bars",
}: {
  title: string;
  insightText?: string;
  series: Top5ChartSeries;
  rankingTotal: number;
  units: DisplayUnits;
  restLabel: string;
  emptyMessage: string;
  methodNote: string;
  favoriteId?: string;
  /** "pie": el mes seleccionado como pastel (top 5 + resto). "bars": 12 meses apilados. */
  variant?: "bars" | "pie";
}) {
  const { t } = useLocale();
  const narrow = useNarrowScreen();
  const data = useMemo(() => toTop5StackedPoints(series), [series]);
  const stackedKeys = useMemo(() => {
    const keys = series.entidades.map((actor) => actor.key);
    if (series.resto) {
      keys.push(series.resto.key);
    }
    return keys;
  }, [series]);
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    series.entidades.forEach((actor, index) => map.set(actor.key, seriesColor(index, actor.key)));
    if (series.resto) {
      map.set(series.resto.key, TOP5_RESTO);
    }
    return map;
  }, [series]);
  const lastBarKey = stackedKeys[stackedKeys.length - 1];
  const showRestoNote = hasClampedResto(series);
  const yMax = Math.max(
    0,
    ...data.map((point) => stackedKeys.reduce((sum, key) => sum + Math.max(0, Number(point[key] ?? 0)), 0)),
  );

  if (series.entidades.length === 0) {
    return (
      <section className="w-full overflow-x-hidden rounded-card border border-dashed border-border bg-card/60 p-6">
        <h3 className="font-sans text-lg font-medium text-foreground">{title}</h3>
        <InsightText text={insightText} />
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      </section>
    );
  }

  const { rows, periodTotal } = top5ActiveMonthRows(series, restLabel);
  const pieRows = rows.filter((row) => row.monto > 0.005);
  const lastLabel = series.months[series.months.length - 1]?.label ?? "";

  return (
    <section className="w-full overflow-x-hidden rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-lg font-medium text-foreground">{title}</h3>
          <InsightText text={insightText} />
        </div>
        <div className="flex items-center gap-1">
          {favoriteId ? <FavoriteStarButton widgetId={favoriteId} label={title} /> : null}
          <p className="financial-nums text-2xl font-semibold tracking-tight">
            {formatAxisTick(periodTotal || rankingTotal, units)}
          </p>
        </div>
      </div>
      <p className="mb-4 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {t(variant === "pie" ? "resultados.top5.pieWindow" : "resultados.top5.seriesWindow")} · {lastLabel} ·{" "}
        {formatMxn(periodTotal)}
      </p>

      {variant === "pie" ? (
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 16, right: 48, bottom: 16, left: 48 }}>
              <Tooltip content={<Top5PieTooltip />} />
              <Pie
                data={pieRows}
                dataKey="monto"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="48%"
                outerRadius="78%"
                paddingAngle={2}
                minAngle={3}
                stroke={CHART.card}
                strokeWidth={2}
                label={narrow ? false : (props: PieLabelGeom) => <SlicePctLabel {...props} />}
                labelLine={false}
                isAnimationActive={false}
              >
                {pieRows.map((row, index) => (
                  <Cell key={row.key} fill={colors.get(row.key) ?? seriesColor(index, row.key)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[360px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="25%" margin={{ top: 36, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
              <XAxis
                dataKey="mes"
                interval={narrow ? "preserveStartEnd" : 0}
                minTickGap={narrow ? 12 : 5}
                tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                axisLine={{ stroke: CHART_AXIS.stroke }}
                tickLine={false}
              />
              <YAxis
                width={64}
                domain={[0, yMax > 0 ? yMax * 1.22 : 1]}
                tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => formatAxisTick(value, units)}
              />
              <Tooltip
                cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
                content={
                  <Top5Tooltip
                    restLabel={restLabel}
                    entidades={series.entidades}
                    includeResto={Boolean(series.resto)}
                    colors={colors}
                  />
                }
              />
              {stackedKeys.map((key, index) => {
                const fill = colors.get(key) ?? seriesColor(index, key);
                const isLast = key === lastBarKey;
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={key === OTROS_KEY ? restLabel : series.entidades.find((actor) => actor.key === key)?.label}
                    stackId={TOP5_STACK_ID}
                    fill={fill}
                    radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    isAnimationActive={false}
                  >
                    {narrow ? null : (
                      <LabelList
                        position="top"
                        offset={8}
                        valueAccessor={(entry) => {
                          const point = entry.payload as Top5StackedPoint | undefined;
                          if (!point || stackTopKey(point, stackedKeys) !== key) {
                            return "";
                          }
                          return totalMesLabel(point.totalMes);
                        }}
                        content={(props) => <TotalStackLabel {...(props as LabelGeom)} />}
                      />
                    )}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{methodNote}</p>
      {showRestoNote ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("resultados.top5.restoClampedNote")}</p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {rows.map((row, index) => {
          const color = colors.get(row.key) ?? seriesColor(index, row.key);
          const negative = row.monto < -0.005;
          return (
            <li key={row.key} className={cn("flex min-w-0 items-center gap-2 text-sm", negative && "opacity-80")}>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: color,
                  ...(row.isResto ? { outline: `1px dashed ${TOP5_RESTO}` } : {}),
                }}
              />
              <span
                className={cn("min-w-0 flex-1 truncate", row.isResto && "text-muted-foreground")}
                title={row.label}
              >
                {row.label}
              </span>
              <span className={cn("financial-nums", negative ? "text-muted-foreground" : "text-foreground")}>
                {formatMxn(row.monto)}
              </span>
              <span
                className={cn(
                  "financial-nums w-14 text-right font-bold tabular-nums",
                  negative ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {row.pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ResultadosTop5Charts({ periodo, units }: ResultadosTop5ChartsProps) {
  const { t } = useLocale();
  const { data, loading, error } = useResultadosTop5(periodo);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <Users className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground">{error ?? t("resultados.top5.loadError")}</p>
        </div>
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-8 overflow-x-hidden">
      <Top5Card
        title={t("resultados.top5.clientsTitle")}
        insightText={t("resultados.top5.clientsInsight")}
        series={data.clientesSeries}
        rankingTotal={data.clientes.total}
        units={units}
        restLabel={t("resultados.top5.restClients")}
        emptyMessage={
          data.fuenteClientes ? t("resultados.top5.emptyClients") : t("resultados.top5.emptyClientsNoAuxiliar")
        }
        methodNote={t("resultados.top5.shareNoteClients")}
        favoriteId="chart-top5-clientes"
        variant="pie"
      />
      <Top5Card
        title={t("resultados.top5.linesTitle")}
        insightText={t("resultados.top5.linesInsight")}
        series={data.lineasSeries}
        rankingTotal={data.lineas.total}
        units={units}
        restLabel={t("resultados.top5.otherLines")}
        emptyMessage={data.hasBalanza ? t("resultados.top5.emptyLines") : t("resultados.incomeMixEmpty")}
        methodNote={t("resultados.top5.shareNoteLines")}
        favoriteId="chart-top5-lineas"
      />
    </div>
  );
}

/**
 * Variante granular para el Panel de Control: renderiza solo la tarjeta de
 * clientes o de líneas, con su propio fetch (deduplicado por api-cache).
 */
export function ResultadosTop5Card({
  kind,
  periodo,
  units,
}: {
  kind: "clientes" | "lineas";
  periodo: string;
  units: DisplayUnits;
}) {
  const { t } = useLocale();
  const { data, loading, error } = useResultadosTop5(periodo);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-card bg-secondary" />;
  }
  if (error || !data) {
    return (
      <section className="rounded-card border border-dashed border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <Users className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground">{error ?? t("resultados.top5.loadError")}</p>
        </div>
      </section>
    );
  }

  return kind === "clientes" ? (
    <Top5Card
      title={t("resultados.top5.clientsTitle")}
      insightText={t("resultados.top5.clientsInsight")}
      series={data.clientesSeries}
      rankingTotal={data.clientes.total}
      units={units}
      restLabel={t("resultados.top5.restClients")}
      emptyMessage={
        data.fuenteClientes ? t("resultados.top5.emptyClients") : t("resultados.top5.emptyClientsNoAuxiliar")
      }
      methodNote={t("resultados.top5.shareNoteClients")}
      favoriteId="chart-top5-clientes"
      variant="pie"
    />
  ) : (
    <Top5Card
      title={t("resultados.top5.linesTitle")}
      insightText={t("resultados.top5.linesInsight")}
      series={data.lineasSeries}
      rankingTotal={data.lineas.total}
      units={units}
      restLabel={t("resultados.top5.otherLines")}
      emptyMessage={data.hasBalanza ? t("resultados.top5.emptyLines") : t("resultados.incomeMixEmpty")}
      methodNote={t("resultados.top5.shareNoteLines")}
      favoriteId="chart-top5-lineas"
    />
  );
}
