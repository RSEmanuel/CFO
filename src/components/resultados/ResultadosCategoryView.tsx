"use client";

import { ExpandableShell } from "@/components/charts/ExpandableChartCard";
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
import { useNombreCuenta } from "@/hooks/use-nombre-cuenta";
import { useEtiquetaPeriodo } from "@/hooks/use-etiqueta-periodo";
import { monthLabelKey } from "@/i18n/format";
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
  const nombreCuenta = useNombreCuenta();
  return (
    <HeroBarChart
      data={data}
      xKey="month"
      yTickFormatter={(value) => formatAxisTick(value, units)}
      tooltipFormatter={(value, name) => [formatMxn(Number(value)), name]}
      series={series.map((key, index) => ({
        dataKey: key,
        name: nombreCuenta(key),
        fill: HERO_CHART_COLORS[index % HERO_CHART_COLORS.length],
        stackId: "category",
      }))}
      showValueLabels
      valueLabelFormatter={(value) => formatAxisTick(value, units)}
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
  const nombreCuenta = useNombreCuenta();
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
      breakdownLabel={(key) => nombreCuenta(key)}
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
  const periodLabel = useEtiquetaPeriodo();
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
  const headlineValue = headlineTotal == null ? t("common.na") : formatAxisTick(headlineTotal, units);
  const comparableText =
    comparableLabel && comparableTotal != null
      ? `${comparable === "mom" ? "MoM" : "YoY"} ${periodLabel(comparableLabel)}: ${formatAxisTick(comparableTotal, units)}`
      : null;

  const titleBlock = (
    <div className="flex items-center gap-2">
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
  );

  const viewToggle = canToggleYear ? (
    <div
      role="group"
      aria-label={t("resultados.chartViewLabel")}
      className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5"
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
  ) : null;

  const yearsNote =
    showYearly && partialYearsNote ? (
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{partialYearsNote}</p>
    ) : null;

  // Ingreso: encabezado en un renglón y la gráfica a todo el ancho de la tarjeta.
  if (category === "Ingreso") {
    return (
      <ExpandableShell className="flex flex-col gap-4 p-6">
        {(toggle, expanded) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pr-10">
              <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
                {titleBlock}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-sans text-lg text-muted-foreground">{periodLabel(headlineLabel)}</span>
                  <span className="financial-nums text-4xl font-medium tracking-tight">{headlineValue}</span>
                  {comparableText ? <span className="text-xs text-muted-foreground">{comparableText}</span> : null}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {viewToggle}
                {toggle}
              </div>
            </div>
            <div
              className={cn(
                expanded ? "min-h-0 flex-1" : "h-[400px] lg:h-[460px]",
                "w-full min-w-0 overflow-visible",
              )}
            >
              <IncomeTotalChart
                data={showYearly && yearlyChartData ? yearlyChartData : chartData}
                series={seriesKeys}
                units={units}
                selectedLabel={showYearly ? (yearlySelectedLabel ?? headlineLabel) : headlineLabel}
              />
            </div>
            {yearsNote}
          </>
        )}
      </ExpandableShell>
    );
  }

  return (
    <ExpandableShell className="flex flex-col gap-6 p-6 lg:flex-row">
      {(toggle, expanded) => (
        <>
          <div className="flex w-full flex-col lg:w-[30%]">
            <div className="mb-4 pr-10 lg:pr-0">{titleBlock}</div>

            <p className="font-sans text-lg text-muted-foreground">{periodLabel(headlineLabel)}</p>
            <p className="financial-nums mt-1 text-4xl font-medium tracking-tight">{headlineValue}</p>
            {comparableText ? <p className="mt-2 text-xs text-muted-foreground">{comparableText}</p> : null}
          </div>

          <div className={cn("flex w-full min-w-0 flex-col lg:w-[70%]", expanded && "min-h-0 flex-1")}>
            <div className="flex items-center justify-end gap-1 lg:pr-10">
              {viewToggle}
              {toggle}
            </div>
            <div
              className={cn(
                expanded ? "min-h-0 flex-1" : "h-[380px] lg:h-[420px]",
                "w-full min-w-0 overflow-visible",
              )}
            >
              <StackedCategoryChart data={chartData} series={seriesKeys} units={units} />
            </div>
            {yearsNote}
          </div>
        </>
      )}
    </ExpandableShell>
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
  const nombreCuenta = useNombreCuenta();
  const periodLabel = useEtiquetaPeriodo();
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
        name: slice.isOther ? t("resultados.incomeBreakdownOther") : nombreCuenta(slice.name),
      })),
    [rows, temporalidad, periodo, comparable, units, t, nombreCuenta],
  );
  if (incomeBreakdown.length === 0) return null;

  return (
    <ExpandableShell className="p-6">
      {(toggle) => (
        <>
          <div className="mb-4 flex items-center gap-2 pr-10">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-secondary text-clay">
              <BarChartHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-sans text-xl font-medium text-foreground">{t("resultados.incomeBreakdown")}</h2>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {periodLabel(headlineLabel)} | {t("resultados.pctOfRevenue")}
              </p>
            </div>
            <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.ingresoDesglose} label={t("resultados.incomeBreakdown")} />
            {toggle}
          </div>
          <IncomeBreakdownBars
            data={incomeBreakdown}
            valueFormatter={formatMxn}
            totalLabel={t("resultados.incomeBreakdownCenter")}
          />
        </>
      )}
    </ExpandableShell>
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
    // Cada año suma de enero al mes de corte; un año con menos meses en ese tramo se ve más bajo.
    const cutoffMonth = Number(periodo.slice(5, 7)) || 12;
    const monthsByYear = new Map<string, number>();
    for (const row of rows) {
      if (Number(row.periodo.slice(5, 7)) > cutoffMonth) continue;
      const year = row.periodo.slice(0, 4);
      monthsByYear.set(year, (monthsByYear.get(year) ?? 0) + 1);
    }
    const partial = [...monthsByYear.entries()].filter(([, count]) => count < cutoffMonth).map(([year]) => year);
    const years =
      partial.length > 1 ? `${partial.slice(0, -1).join(", ")} ${t("common.and")} ${partial.at(-1)}` : partial[0];
    const notes = [
      cutoffMonth < 12 ? t("resultados.yearCutoffNote", { month: t(monthLabelKey(cutoffMonth - 1)) }) : null,
      years ? t("resultados.partialYearsNote", { years }) : null,
    ].filter(Boolean);
    return {
      chartData: series.chartData,
      selectedLabel: series.headlineLabel,
      partialYearsNote: notes.length ? notes.join(" ") : null,
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
