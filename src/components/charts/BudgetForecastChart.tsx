"use client";

import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import { useLocale } from "@/context/LocaleContext";
import type { PresupuestoChartPoint } from "@/services/resultadosPresupuesto";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BudgetForecastChartProps = {
  data: PresupuestoChartPoint[];
  yTickFormatter: (value: number) => string;
  valueFormatter: (value: number) => string;
};

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

export function BudgetForecastChart({
  data,
  yTickFormatter,
  valueFormatter,
}: BudgetForecastChartProps) {
  const { t } = useLocale();
  const forecastStart = data.find((point) => point.kind === "projection")?.label;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 16, right: 12, bottom: 0, left: 8 }}
      >
        <CartesianGrid
          vertical={false}
          stroke={CHART.beigeDeep}
          strokeOpacity={0.6}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_AXIS.tick, fontSize: 10 }}
          axisLine={{ stroke: CHART_AXIS.stroke }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          width={64}
          tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => {
            const labels: Record<string, string> = {
              real: t("resultados.actual"),
              projection: t("resultados.projection"),
              range: t("resultados.range"),
            };
            return [valueFormatter(Number(value)), labels[String(name)] ?? String(name)];
          }}
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          formatter={(value) =>
            value === "real"
              ? t("resultados.actual")
              : value === "projection"
                ? t("resultados.projection")
                : t("resultados.range")
          }
        />
        <Area
          dataKey="low"
          stackId="forecastBand"
          stroke="none"
          fill="transparent"
          legendType="none"
          tooltipType="none"
        />
        <Area
          dataKey="range"
          name="range"
          stackId="forecastBand"
          stroke="none"
          fill={CHART.clay}
          fillOpacity={0.14}
        />
        <Line
          type="monotone"
          dataKey="real"
          name="real"
          stroke="var(--cifra-ink)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="projection"
          name="projection"
          stroke={CHART.clay}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          connectNulls={false}
        />
        {forecastStart ? (
          <ReferenceLine
            x={forecastStart}
            stroke={CHART.mute}
            strokeDasharray="3 3"
            label={{
              value: t("resultados.projection"),
              fill: CHART.mute,
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
