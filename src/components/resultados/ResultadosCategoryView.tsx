"use client";

import { HERO_CHART_COLORS, HeroBarChart } from "@/components/charts/HeroBarChart";
import { HeroLineChart } from "@/components/charts/HeroLineChart";
import { IncomeBreakdownPie } from "@/components/charts/IncomeBreakdownPie";
import { TendenciaIngresosCostosChart } from "@/components/dashboard/TendenciaIngresosCostosChart";
import { CostoMixCompareChart } from "@/components/resultados/CostoMixCompareChart";
import { CogsAnalisisCard } from "@/components/resultados/CogsAnalisisCard";
import { GastoOpexView } from "@/components/resultados/GastoOpexView";
import { IngresoMonitor } from "@/components/resultados/IngresoMonitor";
import { ResultadosTop5Charts } from "@/components/resultados/ResultadosTop5Charts";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/LocaleContext";
import { formatAxisTick, formatMxn } from "@/services/money";
import { buildIncomeBreakdown } from "@/services/financialDataTransformer";
import type { MonthlyFinancials, ResultadosCategoryName } from "@/services/financialDataTransformer";
import { calculateTopKPIs } from "@/services/resultadosKpis";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";
import { LineChart as LineChartIcon, PieChart as PieChartIcon } from "lucide-react";
import { useMemo } from "react";

export type { ResultadosCategoryName };

const KPI_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

function StackedCategoryChart({
  data,
  series,
  units,
}: {
  data: Array<Record<string, string | number | null>>;
  series: string[];
  units: "k" | "m" | "b";
}) {
  return (
    <HeroBarChart
      data={data}
      xKey="month"
      yTickFormatter={(value) => formatAxisTick(value, units)}
      tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
      series={series.map((key, index) => ({
        dataKey: key,
        name: key,
        fill: HERO_CHART_COLORS[index % HERO_CHART_COLORS.length],
        stackId: "category",
      }))}
    />
  );
}

function IncomeTotalChart({
  data,
  series,
  units,
  selectedLabel,
}: {
  data: Array<Record<string, string | number | null>>;
  series: string[];
  units: "k" | "m" | "b";
  selectedLabel: string;
}) {
  const { t } = useLocale();
  return (
    <HeroLineChart
      data={data}
      xKey="month"
      totalKey="total"
      totalLabel={t("resultados.incomeTotal")}
      selectedXValue={selectedLabel}
      breakdownKeys={series}
      othersLabel={t("resultados.others")}
      yTickFormatter={(value) => formatAxisTick(value, units)}
      exactValueFormatter={formatMxn}
      tooltipTotalFormatter={(value) =>
        t("resultados.incomeTotalTooltip", { value: formatMxn(value) })
      }
      valueLabelFormatter={(value) => formatAxisTick(value, units)}
    />
  );
}

function formatDelta(deltaPct: number): string {
  const pct = deltaPct * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export type ResultadosCategoryViewProps = {
  category: ResultadosCategoryName;
  periodo: string;
  temporalidad: string;
  units: "k" | "m" | "b";
  comparable: string;
  chartData: Array<Record<string, string | number | null>>;
  seriesKeys: string[];
  headlineLabel: string;
  headlineTotal: number | null;
  comparableLabel: string | null;
  comparableTotal: number | null;
  budgetPayload?: BudgetProjectionPayload | null;
  rows: MonthlyFinancials[];
};

export function ResultadosCategoryView({
  category,
  periodo,
  temporalidad,
  units,
  comparable,
  chartData,
  seriesKeys,
  headlineLabel,
  headlineTotal,
  comparableLabel,
  comparableTotal,
  budgetPayload,
  rows,
}: ResultadosCategoryViewProps) {
  const { t } = useLocale();
  const tempoLabel =
    temporalidad === "year"
      ? t("resultados.annual")
      : temporalidad === "quarter"
        ? t("resultados.quarterly")
        : t("resultados.monthly");
  const categoryLabel = t(`resultados.${category === "Ingreso" ? "income" : category === "Costo" ? "cost" : "expense"}`);
  const kpis = useMemo(
    () => calculateTopKPIs(rows, category, periodo, budgetPayload),
    [rows, category, periodo, budgetPayload],
  );
  const incomeBreakdown = useMemo(() => {
    if (category !== "Ingreso") {
      return [];
    }
    return buildIncomeBreakdown(rows, {
      temporalidad,
      periodo,
      comparable,
      currency: "mxn",
      units,
      analysis: "amount",
    }).map((slice) => ({
      ...slice,
      name: slice.isOther ? t("resultados.incomeBreakdownOther") : slice.name,
    }));
  }, [category, rows, temporalidad, periodo, comparable, units, t]);
  const kpiTitle = (card: (typeof kpis.cards)[number]) => {
    if (card.key === "promedio3M") return t("resultados.average3m");
    if (card.key === "mesAnterior") return t("resultados.previousMonth");
    if (card.key === "anoAnterior") return t("resultados.previousYear");
    if (card.key === "trimAnterior") return t("resultados.previousQuarter");
    return t(card.title === "Presupuesto oficial" ? "resultados.officialBudget" : "resultados.monthProjection");
  };
  if (category === "Gasto") {
    return (
      <GastoOpexView
        periodo={periodo}
        units={units}
        comparable={comparable}
        budgetPayload={budgetPayload}
        rows={rows}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.cards.map((card) => (
          <article key={card.key} className="rounded-card border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
            <p className="font-serif text-base text-foreground">{kpiTitle(card)}</p>
            <p className="financial-nums mt-2 text-2xl font-semibold tracking-tight">
              {card.value == null ? "N/A" : KPI_FORMATTER.format(card.value)}
            </p>
            {card.deltaPct == null ? null : (
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                  card.deltaPct >= 0
                    ? "bg-category-margins text-favorable"
                    : "bg-category-solvency text-desfavorable",
                )}
              >
                {formatDelta(card.deltaPct)}
              </span>
            )}
          </article>
        ))}
      </div>

      <section className="flex flex-col gap-6 rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:flex-row">
        <div className="flex w-full flex-col lg:w-[30%]">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
              <LineChartIcon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl font-medium text-foreground">{categoryLabel}</h2>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {tempoLabel} | {units.toUpperCase()} | MXN
              </p>
            </div>
          </div>

          <p className="font-serif text-lg text-muted-foreground">{headlineLabel}</p>
          <p className="financial-nums mt-1 text-4xl font-semibold tracking-tight">
            {headlineTotal == null ? t("common.na") : formatAxisTick(headlineTotal, units)}
          </p>
          {comparableLabel && comparableTotal != null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {comparable === "mom" ? "MoM" : "YoY"} {comparableLabel}: {formatAxisTick(comparableTotal, units)}
            </p>
          ) : null}
        </div>

        <div className="h-[380px] w-full min-w-0 overflow-visible lg:h-[420px] lg:w-[70%]">
          {category === "Ingreso" ? (
            <IncomeTotalChart
              data={chartData}
              series={seriesKeys}
              units={units}
              selectedLabel={headlineLabel}
            />
          ) : (
            <StackedCategoryChart data={chartData} series={seriesKeys} units={units} />
          )}
        </div>
      </section>

      {category === "Ingreso" ? (
        <TendenciaIngresosCostosChart rows={rows} units={units} endPeriod={periodo} />
      ) : null}

      {category === "Ingreso" ? (
        <ResultadosTop5Charts periodo={periodo} units={units} />
      ) : null}

      {category === "Ingreso" && incomeBreakdown.length > 0 ? (
        <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
              <PieChartIcon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl font-medium text-foreground">
                {t("resultados.incomeBreakdown")}
              </h2>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {headlineLabel} | {t("resultados.pctOfRevenue")}
              </p>
            </div>
          </div>
          <div className="h-[400px] w-full min-w-0">
            <IncomeBreakdownPie
              data={incomeBreakdown}
              valueFormatter={formatMxn}
              centerValueFormatter={(value) => KPI_FORMATTER.format(value)}
              totalLabel={t("resultados.incomeBreakdownCenter")}
              chartKey={`${periodo}-${temporalidad}-${units}`}
            />
          </div>
        </section>
      ) : null}

      {category === "Ingreso" ? <IngresoMonitor periodo={periodo} /> : null}
      {category === "Costo" ? <CogsAnalisisCard periodo={periodo} /> : null}
      {category === "Costo" ? <CostoMixCompareChart rows={rows} periodo={periodo} /> : null}
    </div>
  );
}
