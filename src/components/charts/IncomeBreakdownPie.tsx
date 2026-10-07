"use client";

import { CHART, CHART_AXIS, CHART_SERIES } from "@/lib/chart-theme";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from "recharts";

export type IncomeBreakdownPieDatum = {
  name: string;
  value: number;
};

type IncomeBreakdownPieProps = {
  data: IncomeBreakdownPieDatum[];
  valueFormatter: (value: number) => string;
  centerValueFormatter?: (value: number) => string;
  totalLabel: string;
  chartKey?: string;
};

const RADIAN = Math.PI / 180;
const LABEL_LINE_STROKE = "var(--cifra-ink-3)";

function formatSharePct(value: number, total: number): string {
  if (total <= 0) {
    return "0.0%";
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Etiqueta permanente: solo `XX.X%` (el nombre vive en la leyenda enriquecida).
 * Evita cortar nombres largos de cuenta junto a rebanadas dominantes.
 */
function renderSlicePercent(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius, percent } = props;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    outerRadius == null ||
    percent == null
  ) {
    return null;
  }
  const radius = Number(outerRadius) + 22;
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
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

export function IncomeBreakdownPie({
  data,
  valueFormatter,
  centerValueFormatter,
  totalLabel,
  chartKey,
}: IncomeBreakdownPieProps) {
  const visible = data.filter((datum) => datum.value > 0);
  const total = visible.reduce((sum, datum) => sum + datum.value, 0);
  const compact = centerValueFormatter ?? valueFormatter;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart key={chartKey} margin={{ top: 28, right: 72, bottom: 28, left: 72 }}>
            <Tooltip
              formatter={(value, name) => {
                const amount = Number(value);
                const pct = total > 0 ? ` (${formatSharePct(amount, total)})` : "";
                return [`${valueFormatter(amount)}${pct}`, name];
              }}
              contentStyle={{
                background: CHART.card,
                border: `1px solid ${CHART.beigeDeep}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Pie
              data={visible}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="46%"
              outerRadius="68%"
              paddingAngle={2}
              minAngle={3}
              stroke={CHART.card}
              strokeWidth={2}
              label={renderSlicePercent}
              labelLine={{ stroke: LABEL_LINE_STROKE, strokeWidth: 1 }}
              isAnimationActive={false}
            >
              {visible.map((datum, index) => (
                <Cell key={datum.name} fill={CHART_SERIES[index % CHART_SERIES.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {total > 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center leading-tight">
              <p className="text-[11px] font-medium text-muted-foreground">{totalLabel}</p>
              <p className="financial-nums text-lg font-bold text-foreground">{compact(total)}</p>
            </div>
          </div>
        ) : null}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2 pb-1 pt-2">
        {visible.map((datum, index) => (
          <li key={datum.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CHART_SERIES[index % CHART_SERIES.length] }}
            />
            <span>
              {datum.name} — {valueFormatter(datum.value)} ({formatSharePct(datum.value, total)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
