"use client";

import { HERO_CHART_COLORS, HeroBarChart } from "@/components/charts/HeroBarChart";
import { HeroLineChart } from "@/components/charts/HeroLineChart";
import { IncomeBreakdownBars } from "@/components/charts/IncomeBreakdownBars";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { CategoryTemporalKpiCard, YearToDateKpiCard } from "@/components/resultados/CategoryTemporalKpiCard";
import { CogsAnalisisCard } from "@/components/resultados/CogsAnalisisCard";
import { GastoOpexView } from "@/components/resultados/GastoOpexView";
import { IngresoMonitor } from "@/components/resultados/IngresoMonitor";
import { ResultadosTop5Charts } from "@/components/resultados/ResultadosTop5Charts";
import { RESULTADOS_FAVORITE } from "@/services/favoritesRegistry";
import { useLocale } from "@/context/LocaleContext";
import { formatAxisTick, formatMxn } from "@/services/money";
import { buildIncomeBreakdown, buildStackedSeries } from "@/services/financialDataTransformer";
import type { MonthlyFinancials, ResultadosCategoryName } from "@/services/financialDataTransformer";
import {
  calculateTopKPIs,
  calculateYearToDate,
  categoryTemporalCards,
  missingMonthsLabel,
  yearToDateLabels,
} from "@/services/resultadosKpis";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";
import { cn } from "@/lib/utils";
import { BarChartHorizontal, LineChart as LineChartIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

export type { ResultadosCategoryName };

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

export function CategorySeriesCard({
  category,
  units,
  temporalidad,
  comparable,
  chartData,
  seriesKeys,
  headlineLabel,
  headlineTotal,
  comparableLabel,
  comparableTotal,
  yearlyChartData,
  yearlySelectedLabel,
  partialYearsNote,
}: {
  category: "Ingreso" | "Costo";
  units: "k" | "m" | "b";
  temporalidad: string;
  comparable: string;
  chartData: Array<Record<string, string | number | null>>;
  seriesKeys: string[];
  headlineLabel: string;
  headlineTotal: number | null;
  comparableLabel: string | null;
  comparableTotal: number | null;
  /** Serie anual de Temporalidad = Año. Si viene, el Ingreso mensual ofrece «Por mes / Por año». */
  yearlyChartData?: Array<Record<string, string | number | null>>;
  yearlySelectedLabel?: string;
  partialYearsNote?: string | null;
}) {
  const { t } = useLocale();
  const [chartView, setChartView] = useState<"month" | "year">("month");
  const canToggleYear = category === "Ingreso" && temporalidad === "month" && Boolean(yearlyChartData?.length);
  const showYearly = canToggleYear && chartView === "year";
  const tempoLabel =
    temporalidad === "year" || showYearly
      ? t("resultados.annual")
      : temporalidad === "quarter"
        ? t("resultados.quarterly")
        : t("resultados.monthly");
  const categoryLabel = t(category === "Ingreso" ? "resultados.income" : "resultados.cost");
  const favoriteId = category === "Ingreso" ? RESULTADOS_FAVORITE.serieIngreso : RESULTADOS_FAVORITE.serieCosto;

  return (
    <section className="flex flex-col gap-6 rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:flex-row">
      <div className="flex w-full flex-col lg:w-[30%]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
            <LineChartIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-xl font-medium text-foreground">{categoryLabel}</h2>
            <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {tempoLabel} | {units.toUpperCase()} | MXN
            </p>
          </div>
          <FavoriteStarButton widgetId={favoriteId} label={categoryLabel} />
        </div>

        <p className="font-sans text-lg text-muted-foreground">{headlineLabel}</p>
        <p className="financial-nums mt-1 text-4xl font-semibold tracking-tight">
          {headlineTotal == null ? t("common.na") : formatAxisTick(headlineTotal, units)}
        </p>
        {comparableLabel && comparableTotal != null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {comparable === "mom" ? "MoM" : "YoY"} {comparableLabel}: {formatAxisTick(comparableTotal, units)}
          </p>
        ) : null}
      </div>

      <div className="flex w-full min-w-0 flex-col lg:w-[70%]">
        {canToggleYear ? (
          <div
            role="group"
            aria-label={t("resultados.chartViewLabel")}
            className="inline-flex h-10 items-center self-end rounded-control border border-input bg-card p-0.5"
          >
            {(["month", "year"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setChartView(view)}
                aria-pressed={chartView === view}
                className={cn(
                  "h-9 rounded-control px-3 text-sm font-medium transition-colors",
                  chartView === view
                    ? "bg-secondary text-clay shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(view === "month" ? "resultados.chartByMonth" : "resultados.chartByYear")}
              </button>
            ))}
          </div>
        ) : null}
        <div className="h-[380px] w-full min-w-0 overflow-visible lg:h-[420px]">
          {category === "Ingreso" ? (
            <IncomeTotalChart
              data={showYearly && yearlyChartData ? yearlyChartData : chartData}
              series={seriesKeys}
              units={units}
              selectedLabel={showYearly ? (yearlySelectedLabel ?? headlineLabel) : headlineLabel}
            />
          ) : (
            <StackedCategoryChart data={chartData} series={seriesKeys} units={units} />
          )}
        </div>
        {showYearly && partialYearsNote ? (
          <p className="mt-2 text-xs leading-snug text-muted-foreground">{partialYearsNote}</p>
        ) : null}
      </div>
    </section>
  );
}

export function IncomeBreakdownCard({
  rows,
  periodo,
  temporalidad,
  units,
  comparable,
  headlineLabel,
}: {
  rows: MonthlyFinancials[];
  periodo: string;
  temporalidad: string;
  units: "k" | "m" | "b";
  comparable: string;
  headlineLabel: string;
}) {
  const { t } = useLocale();
  const incomeBreakdown = useMemo(
    () =>
      buildIncomeBreakdown(rows, {
        temporalidad,
        periodo,
        comparable,
        currency: "mxn",
        units,
        analysis: "amount",
      }).map((slice) => ({
        ...slice,
        name: slice.isOther ? t("resultados.incomeBreakdownOther") : slice.name,
      })),
    [rows, temporalidad, periodo, comparable, units, t],
  );
  if (incomeBreakdown.length === 0) return null;

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
          <BarChartHorizontal className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-xl font-medium text-foreground">{t("resultados.incomeBreakdown")}</h2>
          <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {headlineLabel} | {t("resultados.pctOfRevenue")}
          </p>
        </div>
        <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.ingresoDesglose} label={t("resultados.incomeBreakdown")} />
      </div>
      <IncomeBreakdownBars
        data={incomeBreakdown}
        valueFormatter={formatMxn}
        totalLabel={t("resultados.incomeBreakdownCenter")}
      />
    </section>
  );
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
  const { t, locale } = useLocale();
  const kpis = useMemo(
    () => calculateTopKPIs(rows, category, periodo, budgetPayload),
    [rows, category, periodo, budgetPayload],
  );
  const temporalCards = useMemo(
    () => categoryTemporalCards(kpis, periodo, category, t, locale),
    [kpis, periodo, category, t, locale],
  );
  const yearToDate = useMemo(() => {
    if (category !== "Ingreso" || !periodo) return null;
    const ytd = calculateYearToDate(rows, category, periodo);
    const labels = yearToDateLabels(periodo, t, locale);
    return {
      ...ytd,
      ...labels,
      missingNote: ytd.missing.length
        ? t("resultados.yearToDateIncomplete", { months: missingMonthsLabel(ytd.missing, t, locale) })
        : null,
    };
  }, [rows, category, periodo, t, locale]);
  const yearly = useMemo(() => {
    if (category !== "Ingreso" || temporalidad !== "month") return null;
    // Mismo camino que Temporalidad = Año en el filtro global.
    const series = buildStackedSeries(
      rows,
      { temporalidad: "year", periodo, comparable, currency: "mxn", units, analysis: "amount" },
      "Ingreso",
    );
    const monthsByYear = new Map<string, number>();
    for (const row of rows) {
      const year = row.periodo.slice(0, 4);
      monthsByYear.set(year, (monthsByYear.get(year) ?? 0) + 1);
    }
    const partial = [...monthsByYear.entries()].filter(([, count]) => count < 12).map(([year]) => year);
    const years =
      partial.length > 1 ? `${partial.slice(0, -1).join(", ")} ${t("common.and")} ${partial.at(-1)}` : partial[0];
    return {
      chartData: series.chartData,
      selectedLabel: series.headlineLabel,
      partialYearsNote: years ? t("resultados.partialYearsNote", { years }) : null,
    };
  }, [rows, category, temporalidad, periodo, comparable, units, t]);
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
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          yearToDate ? "lg:grid-cols-3 xl:grid-cols-6" : "xl:grid-cols-5",
        )}
      >
        {temporalCards.map((card, index) => (
          <Fragment key={card.key}>
            <CategoryTemporalKpiCard card={card} category={category} />
            {index === 0 && yearToDate ? (
              <YearToDateKpiCard
                category={category}
                periodLabel={yearToDate.current}
                value={yearToDate.value}
                deltaPct={yearToDate.deltaPct}
                priorLabel={yearToDate.prior}
                missingNote={yearToDate.missingNote}
              />
            ) : null}
          </Fragment>
        ))}
      </div>

      <CategorySeriesCard
        category={category}
        units={units}
        temporalidad={temporalidad}
        comparable={comparable}
        chartData={chartData}
        seriesKeys={seriesKeys}
        headlineLabel={headlineLabel}
        headlineTotal={headlineTotal}
        comparableLabel={comparableLabel}
        comparableTotal={comparableTotal}
        yearlyChartData={yearly?.chartData}
        yearlySelectedLabel={yearly?.selectedLabel}
        partialYearsNote={yearly?.partialYearsNote}
      />

      {category === "Ingreso" ? (
        <ResultadosTop5Charts periodo={periodo} units={units} />
      ) : null}

      {category === "Ingreso" ? (
        <IncomeBreakdownCard
          rows={rows}
          periodo={periodo}
          temporalidad={temporalidad}
          units={units}
          comparable={comparable}
          headlineLabel={headlineLabel}
        />
      ) : null}

      {category === "Ingreso" ? <IngresoMonitor periodo={periodo} /> : null}
      {category === "Costo" ? <CogsAnalisisCard periodo={periodo} /> : null}
    </div>
  );
}
