"use client";

import { CHART, CHART_AXIS } from "@/lib/chart-theme";
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

export type HeroLineDatum = Record<string, string | number | null>;

type HeroLineChartProps = {
  data: HeroLineDatum[];
  xKey: string;
  totalKey: string;
  totalLabel: string;
  selectedXValue: string;
  breakdownKeys: string[];
  othersLabel: string;
  yTickFormatter?: (value: number) => string;
  exactValueFormatter: (value: number) => string;
  tooltipTotalFormatter: (value: number) => string;
  valueLabelFormatter: (value: number) => string;
  chartKey?: string;
};

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

const POINT_LABEL_FILL = "#7c2d12";

function seriesNumbers(data: HeroLineDatum[], totalKey: string): Array<number | null> {
  return data.map((datum) => {
    const value = datum[totalKey];
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

const LABEL_W = 54;
const LABEL_H = 14;
const APPROX_PLOT_H = 200;
const APPROX_STEP_X = 40;

function boxesOverlap(
  a: { x: number; y: number; r: number; b: number },
  c: { x: number; y: number; r: number; b: number },
): boolean {
  return a.x < c.r && a.r > c.x && a.y < c.b && a.b > c.y;
}

/**
 * `dy` extra (SVG: negativo = más arriba). Parte de 3 bandas y empuja si el
 * hueco del valle cancela el stagger (p. ej. $1,202K junto a $2,753K).
 */
function pointLabelOffsets(values: Array<number | null>): number[] {
  const finite = values.filter((item): item is number => item != null);
  const max = finite.length ? Math.max(...finite) : 1;
  const ceiling = max * 1.22 || 1;
  const pointYs = values.map((value) =>
    value == null ? APPROX_PLOT_H : (1 - value / ceiling) * APPROX_PLOT_H,
  );
  const dys = values.map((_, index) => {
    const band = index % 3 === 0 ? -22 : index % 3 === 1 ? -2 : 18;
    return band + (isLocalPeak(values, index) ? -8 : 0);
  });
  const boxAt = (index: number) => {
    const x = index * APPROX_STEP_X;
    const y = (pointYs[index] ?? APPROX_PLOT_H) - 12 + (dys[index] ?? 0);
    return { x: x - LABEL_W / 2, y, r: x + LABEL_W / 2, b: y + LABEL_H };
  };
  for (let index = 1; index < values.length; index += 1) {
    for (let other = 0; other < index; other += 1) {
      let guard = 0;
      while (boxesOverlap(boxAt(other), boxAt(index)) && guard < 16) {
        dys[index] = (dys[index] ?? 0) + 8;
        guard += 1;
      }
    }
  }
  return dys;
}

const TOOLTIP_TOP_ACCOUNTS = 5;

function rankedBreakdown(
  datum: HeroLineDatum,
  breakdownKeys: string[],
): Array<{ key: string; value: number }> {
  return breakdownKeys
    .flatMap((key) => {
      const value = datum[key];
      return typeof value === "number" && Number.isFinite(value) && value !== 0
        ? [{ key, value }]
        : [];
    })
    .sort((left, right) => right.value - left.value);
}

function IncomeTooltip({
  active,
  payload,
  label,
  totalKey,
  breakdownKeys,
  othersLabel,
  exactValueFormatter,
  tooltipTotalFormatter,
}: {
  active?: boolean;
  payload?: Array<{ payload?: HeroLineDatum }>;
  label?: string | number;
  totalKey: string;
  breakdownKeys: string[];
  othersLabel: string;
  exactValueFormatter: (value: number) => string;
  tooltipTotalFormatter: (value: number) => string;
}) {
  const datum = payload?.[0]?.payload;
  const rawTotal = datum?.[totalKey];
  if (!active || !datum || typeof rawTotal !== "number") {
    return null;
  }

  const ranked = rankedBreakdown(datum, breakdownKeys);
  const top = ranked.slice(0, TOOLTIP_TOP_ACCOUNTS);
  const rest = ranked.slice(TOOLTIP_TOP_ACCOUNTS);
  const othersTotal = rest.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="min-w-48 px-3 py-2 text-xs text-foreground" style={TOOLTIP_STYLE}>
      <p className="mb-1 font-medium">{label}</p>
      <p className="font-semibold text-clay">{tooltipTotalFormatter(rawTotal)}</p>
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        {top.map(({ key, value }) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{key}</span>
            <span className="financial-nums">{exactValueFormatter(value)}</span>
          </div>
        ))}
        {rest.length > 0 ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{othersLabel}</span>
            <span className="financial-nums">{exactValueFormatter(othersTotal)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IncomeDot({
  cx,
  cy,
  payload,
  xKey,
  selectedXValue,
}: {
  cx?: number;
  cy?: number;
  payload?: HeroLineDatum;
  xKey: string;
  selectedXValue: string;
}) {
  if (cx == null || cy == null || !payload) {
    return null;
  }
  const selected = String(payload[xKey] ?? "") === selectedXValue;
  return (
    <g>
      {selected ? (
        <circle cx={cx} cy={cy} r={9} fill={CHART.card} stroke={CHART.clay} strokeWidth={2} />
      ) : null}
      <circle cx={cx} cy={cy} r={selected ? 5 : 4.5} fill={CHART.clay} stroke={CHART.card} strokeWidth={2} />
    </g>
  );
}

function IncomePointLabel({
  x,
  y,
  value,
  index,
  seriesValues,
  labelOffsets,
  formatValue,
}: {
  x?: number | string;
  y?: number | string;
  value?: number | string | null;
  index?: number;
  seriesValues: Array<number | null>;
  labelOffsets: number[];
  formatValue: (value: number) => string;
}) {
  if (x == null || y == null || index == null) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const last = seriesValues.length - 1;
  const textAnchor = index === 0 ? "start" : index === last ? "end" : "middle";
  return (
    <text
      x={Number(x)}
      y={Number(y) + (labelOffsets[index] ?? 0)}
      textAnchor={textAnchor}
      fill={POINT_LABEL_FILL}
      fontSize={12}
      fontWeight={600}
      stroke="#fff"
      strokeWidth={3}
      paintOrder="stroke fill"
      style={{ pointerEvents: "none" }}
    >
      {formatValue(numeric)}
    </text>
  );
}

export function HeroLineChart({
  data,
  xKey,
  totalKey,
  totalLabel,
  selectedXValue,
  breakdownKeys,
  othersLabel,
  yTickFormatter,
  exactValueFormatter,
  tooltipTotalFormatter,
  valueLabelFormatter,
  chartKey,
}: HeroLineChartProps) {
  const seriesValues = seriesNumbers(data, totalKey);
  const labelOffsets = pointLabelOffsets(seriesValues);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        key={chartKey}
        data={data}
        margin={{ top: 52, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid vertical={false} stroke={CHART_AXIS.stroke} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          interval="preserveStartEnd"
          tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
          axisLine={{ stroke: CHART_AXIS.stroke }}
          tickLine={false}
        />
        <YAxis
          width={64}
          domain={[0, (dataMax: number) => (Number.isFinite(dataMax) ? dataMax * 1.22 : 0)]}
          tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          cursor={{ stroke: CHART.beigeDeep, strokeWidth: 1 }}
          content={
            <IncomeTooltip
              totalKey={totalKey}
              breakdownKeys={breakdownKeys}
              othersLabel={othersLabel}
              exactValueFormatter={exactValueFormatter}
              tooltipTotalFormatter={tooltipTotalFormatter}
            />
          }
        />
        <Line
          type="monotone"
          dataKey={totalKey}
          name={totalLabel}
          stroke={CHART.clay}
          strokeWidth={3}
          connectNulls={false}
          isAnimationActive={false}
          dot={<IncomeDot xKey={xKey} selectedXValue={selectedXValue} />}
          activeDot={{ r: 6, fill: CHART.clay, stroke: CHART.card, strokeWidth: 2 }}
        >
          <LabelList
            dataKey={totalKey}
            position="top"
            offset={12}
            content={
              <IncomePointLabel
                seriesValues={seriesValues}
                labelOffsets={labelOffsets}
                formatValue={valueLabelFormatter}
              />
            }
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}
