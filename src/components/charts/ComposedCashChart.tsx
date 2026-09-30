"use client";

import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ESPRESSO = "#1A1915";

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

export type ComposedCashPoint = {
  label: string;
  flujoNeto: number;
  saldoFinal: number;
};

type ComposedCashChartProps = {
  data: ComposedCashPoint[];
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number | string, name: string) => [string, string];
  chartKey?: string;
};

export function ComposedCashChart({ data, yTickFormatter, tooltipFormatter, chartKey }: ComposedCashChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart key={chartKey} data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.beigeDeep} strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
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
        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={LEGEND_STYLE} />
        <Bar dataKey="flujoNeto" name="Flujo neto" maxBarSize={28} radius={[4, 4, 0, 0]}>
          {data.map((point) => (
            <Cell key={point.label} fill={point.flujoNeto >= 0 ? CHART.clay : CHART.coral} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="saldoFinal"
          name="Efectivo"
          stroke={ESPRESSO}
          strokeWidth={2}
          dot={false}
          fill="none"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
