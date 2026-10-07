"use client";

import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { InsightText } from "@/components/insight-text";
import { useLocale } from "@/context/LocaleContext";
import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import {
  periodLabel,
  trailingMonthlyRows,
  TREND_WINDOW_MONTHS,
  type MonthlyFinancials,
} from "@/services/financialDataTransformer";
import { formatAxisTick, formatCompactAxis, formatMxn, type DisplayUnits } from "@/services/money";
import { useMemo } from "react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNarrowScreen } from "@/hooks/use-narrow-screen";

type TendenciaIngresosCostosChartProps = {
  rows: MonthlyFinancials[];
  units: DisplayUnits;
  endPeriod?: string;
  /** Qué mide la serie. Si se omite, usa widgets.trendHelp. */
  insightText?: string;
};

type TrendDatum = {
  label: string;
  ingreso: number;
  costo: number;
};

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

/** Paleta local ingreso/costo (no usa CHART.clay/coral: esos alimentan HeroLine y otros). */
const INGRESO_LINE = "var(--cifra-good)";
const INGRESO_LABEL = "var(--cifra-good)";
const COSTO_LINE = "var(--cifra-bad)";
const COSTO_LABEL = "var(--cifra-bad)";

function seriesNumbers(data: TrendDatum[], key: "ingreso" | "costo"): Array<number | null> {
  return data.map((datum) => {
    const value = datum[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
}

function neighbor(values: Array<number | null>, index: number, delta: number): number | null {
  const next = index + delta;
  if (next < 0 || next >= values.length) {
    return null;
  }
  return values[next] ?? null;
}

function isLocalPeak(values: Array<number | null>, index: number): boolean {
  const value = values[index];
  if (value == null) {
    return false;
  }
  const prev = neighbor(values, index, -1);
  const next = neighbor(values, index, 1);
  if (prev == null && next == null) {
    return false;
  }
  if (prev == null) {
    return next != null && value > next;
  }
  if (next == null) {
    return value > prev;
  }
  return value >= prev && value >= next && value > Math.min(prev, next);
}

function isLocalValley(values: Array<number | null>, index: number): boolean {
  const value = values[index];
  if (value == null) {
    return false;
  }
  const prev = neighbor(values, index, -1);
  const next = neighbor(values, index, 1);
  if (prev == null && next == null) {
    return false;
  }
  if (prev == null) {
    return next != null && value < next;
  }
  if (next == null) {
    return value < prev;
  }
  return value <= prev && value <= next && value < Math.max(prev, next);
}

const CHART_HEIGHT = 340;
const CHART_MARGIN = { top: 32, right: 36, left: 8, bottom: 28 } as const;
const PLOT_BOTTOM = CHART_HEIGHT - CHART_MARGIN.bottom;
const SERIES_CLOSE_RATIO = 0.18;
const SERIES_VERY_CLOSE_RATIO = 0.08;

type PointLabelLayout = {
  side: "top" | "bottom";
  dx: number;
  dy: number;
};

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Densidad de etiquetas: TTM (≤12) marca todos los puntos finitos. Más allá,
 * ingreso va cada 2 meses + extremos/picos; costo replica esos puntos y suma
 * picos/valles propios (no se oculta para “hacer hueco”).
 */
function incomeLabelMask(values: Array<number | null>): boolean[] {
  const length = values.length;
  if (length <= 12) {
    return values.map((value) => isFiniteValue(value));
  }
  return values.map((value, index) => {
    if (!isFiniteValue(value)) {
      return false;
    }
    if (index === 0 || index === length - 1 || index % 2 === 0) {
      return true;
    }
    return isLocalPeak(values, index);
  });
}

function costLabelMask(values: Array<number | null>, incomeVisible: boolean[]): boolean[] {
  const length = values.length;
  if (length <= 12) {
    return values.map((value) => isFiniteValue(value));
  }
  return values.map((value, index) => {
    if (!isFiniteValue(value)) {
      return false;
    }
    if (incomeVisible[index]) {
      return true;
    }
    return isLocalPeak(values, index) || isLocalValley(values, index);
  });
}

function seriesGapRatio(ingreso: number, costo: number): number {
  const mag = Math.max(Math.abs(ingreso), Math.abs(costo), 1);
  return Math.abs(ingreso - costo) / mag;
}

function buildTrendLabelLayouts(
  data: TrendDatum[],
  incomeVisible: boolean[],
  costVisible: boolean[],
): { ingreso: PointLabelLayout[]; costo: PointLabelLayout[] } {
  const last = data.length - 1;
  const ingreso: PointLabelLayout[] = [];
  const costo: PointLabelLayout[] = [];

  for (let index = 0; index < data.length; index++) {
    const both = Boolean(incomeVisible[index] && costVisible[index]);
    const gap =
      both && isFiniteValue(data[index].ingreso) && isFiniteValue(data[index].costo)
        ? seriesGapRatio(data[index].ingreso, data[index].costo)
        : 1;
    const close = both && gap < SERIES_CLOSE_RATIO;
    const veryClose = both && gap < SERIES_VERY_CLOSE_RATIO;
    const interior = index !== 0 && index !== last;
    const staggerX = both && interior && (close || veryClose);
    const even = index % 2 === 0;

    ingreso.push({
      side: "top",
      dy: close ? -18 : -10,
      dx: staggerX ? (even ? -10 : 10) : 0,
    });
    costo.push({
      side: "bottom",
      dy: close ? 22 : 16,
      dx: staggerX ? (even ? 10 : -10) : 0,
    });
  }

  return { ingreso, costo };
}

function TrendPointLabel({
  x,
  y,
  value,
  index,
  color,
  visible,
  layouts,
}: {
  x?: number | string;
  y?: number | string;
  value?: number | string | null;
  index?: number;
  color: string;
  visible: boolean[];
  layouts: PointLabelLayout[];
}) {
  if (x == null || y == null || index == null || !visible[index]) {
    return null;
  }
  const layout = layouts[index];
  if (!layout) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const last = visible.length - 1;
  const textAnchor = index === 0 ? "start" : index === last ? "end" : "middle";
  let { side, dx, dy } = layout;
  const px = Number(x);
  const py = Number(y);

  if (side === "bottom" && py + dy > PLOT_BOTTOM - 6) {
    const room = PLOT_BOTTOM - 8 - py;
    if (room >= 10) {
      dy = room;
    } else {
      side = "top";
      dy = -10;
      if (dx === 0 && index !== 0 && index !== last) {
        dx = index % 2 === 0 ? 10 : -10;
      }
    }
  }
  if (side === "top" && py + dy < 8) {
    dy = Math.min(-6, 8 - py);
  }

  return (
    <text
      x={px + dx}
      y={py + dy}
      textAnchor={textAnchor}
      fill={color}
      fontSize={11}
      fontWeight={600}
      stroke="var(--cifra-brand-contrast)"
      strokeWidth={3}
      paintOrder="stroke fill"
      style={{ pointerEvents: "none" }}
    >
      {formatCompactAxis(numeric)}
    </text>
  );
}

export function TendenciaIngresosCostosChart({
  rows,
  units,
  endPeriod,
  insightText,
}: TendenciaIngresosCostosChartProps) {
  const { t } = useLocale();
  const narrow = useNarrowScreen();
  const data = useMemo(
    () =>
      trailingMonthlyRows(rows, endPeriod, TREND_WINDOW_MONTHS).map((row) => ({
        label: periodLabel(row.periodo),
        ingreso: row.ingreso_total,
        costo: row.costo_total,
      })),
    [rows, endPeriod],
  );
  const incomeVisible = useMemo(() => incomeLabelMask(seriesNumbers(data, "ingreso")), [data]);
  const costVisible = useMemo(
    () => costLabelMask(seriesNumbers(data, "costo"), incomeVisible),
    [data, incomeVisible],
  );
  const labelLayouts = useMemo(
    () => buildTrendLabelLayouts(data, incomeVisible, costVisible),
    [data, incomeVisible, costVisible],
  );

  if (data.length === 0) {
    return null;
  }

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-xl font-medium text-foreground">{t("widgets.trendTitle")}</h2>
          <InsightText text={insightText ?? t("widgets.trendHelp")} />
        </div>
        <div className="flex items-center gap-2">
          <FavoriteStarButton widgetId="chart-ingresos-costos" label={t("widgets.trendTitle")} />
          <ul className="flex items-center gap-4 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INGRESO_LINE }} />
              {t("resultados.income")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COSTO_LINE }} />
              {t("resultados.cost")}
            </li>
          </ul>
        </div>
      </div>
      <div className="h-[340px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke={CHART_AXIS.stroke} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              interval={narrow ? "preserveStartEnd" : 0}
              minTickGap={narrow ? 12 : 5}
              tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
              axisLine={{ stroke: CHART_AXIS.stroke }}
              tickLine={false}
            />
            <YAxis
              width={64}
              domain={[0, (dataMax: number) => (Number.isFinite(dataMax) ? dataMax * 1.18 : 0)]}
              tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatAxisTick(value, units)}
            />
            <Tooltip
              cursor={{ stroke: CHART.beigeDeep, strokeWidth: 1 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [formatMxn(Number(value)), name]}
            />
            <Line
              type="monotone"
              dataKey="ingreso"
              name={t("resultados.income")}
              stroke={INGRESO_LINE}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "var(--cifra-brand-contrast)", stroke: INGRESO_LINE, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "var(--cifra-brand-contrast)", stroke: INGRESO_LINE, strokeWidth: 2 }}
              isAnimationActive={false}
            >
              {narrow ? null : (
                <LabelList
                  dataKey="ingreso"
                  position="top"
                  offset={10}
                  content={
                    <TrendPointLabel color={INGRESO_LABEL} visible={incomeVisible} layouts={labelLayouts.ingreso} />
                  }
                />
              )}
            </Line>
            <Line
              type="monotone"
              dataKey="costo"
              name={t("resultados.cost")}
              stroke={COSTO_LINE}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "var(--cifra-brand-contrast)", stroke: COSTO_LINE, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "var(--cifra-brand-contrast)", stroke: COSTO_LINE, strokeWidth: 2 }}
              isAnimationActive={false}
            >
              {narrow ? null : (
                <LabelList
                  dataKey="costo"
                  position="bottom"
                  offset={10}
                  content={
                    <TrendPointLabel color={COSTO_LABEL} visible={costVisible} layouts={labelLayouts.costo} />
                  }
                />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
