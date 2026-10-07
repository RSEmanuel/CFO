"use client";

import { useLocale } from "@/context/LocaleContext";
import { CHART, CHART_AXIS } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { formatAxisTick, formatMxn, type DisplayUnits } from "@/services/money";
import {
  sensitivityTornado,
  type SimulationResult,
  type SimulatorBaseline,
  type SimulatorDriverKey,
} from "@/services/simulatorEngine";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TOOLTIP_STYLE = {
  background: CHART.card,
  borderRadius: 10,
  border: `1px solid ${CHART.beigeDeep}`,
  boxShadow: "0 4px 16px rgb(40 30 20 / 0.08)",
} as const;

type SimulatorChartsProps = {
  baseline: SimulatorBaseline;
  sim: SimulationResult;
  units: DisplayUnits;
};

export function SimulatorCharts({ baseline, sim, units }: SimulatorChartsProps) {
  const { t } = useLocale();
  const [view, setView] = useState<"compare" | "tornado">("compare");

  const compareData = useMemo(
    () => [
      { name: t("simulator.chart.income"), base: baseline.ventas, sim: sim.ingresos },
      { name: t("simulator.chart.cost"), base: baseline.cogs, sim: sim.cogs },
      { name: t("simulator.chart.opex"), base: baseline.opex, sim: sim.opex },
      { name: t("simulator.chart.ebitda"), base: baseline.ebitda, sim: sim.ebitda },
    ],
    [baseline, sim, t],
  );

  const driverLabel = (driver: SimulatorDriverKey): string => t(`simulator.drivers.${driver}`);

  const tornadoData = useMemo(
    () =>
      sensitivityTornado(baseline).map((row) => ({
        name: driverLabel(row.driver),
        low: row.low,
        high: row.high,
      })),
    // driverLabel depende solo del locale; t cambia con él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseline, t],
  );

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-xl font-medium text-foreground">
            {view === "compare" ? t("simulator.chart.compareTitle") : t("simulator.chart.tornadoTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "compare" ? t("simulator.chart.compareHelp") : t("simulator.chart.tornadoHelp")}
          </p>
        </div>
        <div className="inline-flex h-9 items-center rounded-control border border-input bg-card p-0.5">
          {(["compare", "tornado"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={cn(
                "h-8 rounded-control px-3 text-xs font-medium transition-colors",
                view === option
                  ? "bg-secondary text-clay shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option === "compare" ? t("simulator.chart.viewCompare") : t("simulator.chart.viewTornado")}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[320px] w-full min-w-0">
        {view === "compare" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData} margin={{ top: 16, right: 12, left: 8, bottom: 0 }} barGap={6}>
              <CartesianGrid vertical={false} stroke={CHART_AXIS.stroke} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                axisLine={{ stroke: CHART_AXIS.stroke }}
                tickLine={false}
              />
              <YAxis
                width={72}
                tick={{ fill: CHART_AXIS.tick, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => formatAxisTick(value, units)}
              />
              <Tooltip
                cursor={{ fill: CHART.beigeDeep, opacity: 0.25 }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [formatMxn(Number(value)), name]}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 12 }} />
              <Bar dataKey="base" name={t("simulator.chart.base")} fill={CHART.mute} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="sim" name={t("simulator.chart.simulated")} fill={CHART.clay} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tornadoData} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 0 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke={CHART_AXIS.stroke} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                axisLine={{ stroke: CHART_AXIS.stroke }}
                tickLine={false}
                tickFormatter={(value: number) => formatAxisTick(value, units)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={190}
                tick={{ fill: CHART_AXIS.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: CHART.beigeDeep, opacity: 0.25 }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [formatMxn(Number(value)), name]}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 12 }} />
              <Bar dataKey="low" name={t("simulator.chart.driverMin")} fill={CHART.coral} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              <Bar dataKey="high" name={t("simulator.chart.driverMax")} fill={CHART.olive} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
