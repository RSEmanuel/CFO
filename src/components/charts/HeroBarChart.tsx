"use client";

import { CHART, CHART_AXIS, CHART_SERIES } from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const HERO_CHART_COLORS = CHART_SERIES;

export const TIME_COMPARE_COLORS = {
  actual: CHART.clay,
  prior: CHART.beigeDeep,
} as const;

export const PROJECTION_LAYER_COLORS = {
  oficial: CHART.beigeDeep,
  estadistica: "var(--cifra-ink)",
  escenario: CHART.clay,
} as const;

export type HeroBarSeries = {
  dataKey: string;
  name?: string;
  fill: string;
  stackId?: string;
};

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

const LEGEND_STYLE = {
  width: "100%",
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: 8,
  paddingBottom: 16,
  fontSize: 12,
};

export type HeroBarDatum = Record<string, string | number | null>;

type HeroBarChartProps = {
  data: HeroBarDatum[];
  xKey: string;
  series: HeroBarSeries[];
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number | string, name: string) => [string, string];
  legendFormatter?: (value: string) => string;
  chartKey?: string;
  showValueLabels?: boolean;
  valueLabelFormatter?: (value: number, dataKey: string, payload: HeroBarDatum) => string;
};

export function HeroBarChart({
  data,
  xKey,
  series,
  yTickFormatter,
  tooltipFormatter,
  legendFormatter,
  chartKey,
  showValueLabels = false,
  valueLabelFormatter,
}: HeroBarChartProps) {
  const lastStackedIndex = series.reduce((last, item, index) => (item.stackId ? index : last), -1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart key={chartKey} data={data} margin={{ top: showValueLabels ? 28 : 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey={xKey}
          tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
          axisLine={{ stroke: CHART_AXIS.stroke }}
          tickLine={false}
        />
        <YAxis
          width={64}
          tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          cursor={{ fill: "rgb(196 93 62 / 0.06)" }}
          contentStyle={TOOLTIP_STYLE}
          formatter={
            tooltipFormatter
              ? (value, name) => tooltipFormatter(value as number | string, String(name))
              : undefined
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          wrapperStyle={LEGEND_STYLE}
          formatter={legendFormatter}
        />
        {series.map((item, index) => {
          const isStacked = Boolean(item.stackId);
          const roundTop = !isStacked || index === lastStackedIndex;
          return (
            <Bar
              key={item.dataKey}
              dataKey={item.dataKey}
              name={item.name ?? item.dataKey}
              stackId={item.stackId}
              fill={item.fill}
              radius={roundTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={80}
            >
              {showValueLabels ? (
                <LabelList
                  position="top"
                  fill={CHART_AXIS.tick}
                  fontSize={11}
                  valueAccessor={(entry) => {
                    const payload = (entry.payload ?? {}) as HeroBarDatum;
                    const raw = payload[item.dataKey];
                    const numeric = typeof raw === "number" ? raw : Number(raw ?? 0);
                    if (valueLabelFormatter) {
                      return valueLabelFormatter(Number.isFinite(numeric) ? numeric : 0, item.dataKey, payload);
                    }
                    return Number.isFinite(numeric) ? String(numeric) : "";
                  }}
                />
              ) : null}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
