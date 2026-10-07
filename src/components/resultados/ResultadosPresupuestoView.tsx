"use client";

import { BudgetForecastChart } from "@/components/charts/BudgetForecastChart";
import { FavoriteStarButton } from "@/components/favorites/favorite-star-button";
import { RESULTADOS_FAVORITE } from "@/services/favoritesRegistry";
import { BudgetDriversForm } from "@/components/resultados/BudgetDriversForm";
import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/LocaleContext";
import { formatAxisTick } from "@/services/money";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";
import {
  buildGroupedProjection,
  buildPresupuestoViewModel,
  type EscenarioPresupuesto,
  type HorizonMonths,
  type PresupuestoGrouping,
  type PresupuestoRubroKey,
} from "@/services/resultadosPresupuesto";
import { useMemo, useState } from "react";

const LOWER_IS_BETTER = new Set<PresupuestoRubroKey>(["costo", "gasto"]);

function formatDeltaPct(deltaPct: number | null): string {
  if (deltaPct == null) {
    return "—";
  }
  const pct = deltaPct * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function deltaFavorable(key: PresupuestoRubroKey, deltaPct: number): boolean {
  if (LOWER_IS_BETTER.has(key)) {
    return deltaPct < 0;
  }
  return deltaPct > 0;
}

const SCENARIOS: Array<{
  value: EscenarioPresupuesto;
  labelKey: string;
  explanationKey: string;
}> = [
  {
    value: "base",
    labelKey: "resultados.scenarioBase",
    explanationKey: "resultados.scenarioBaseHelp",
  },
  {
    value: "conservador",
    labelKey: "resultados.scenarioConservative",
    explanationKey: "resultados.scenarioConservativeHelp",
  },
  {
    value: "estirado",
    labelKey: "resultados.scenarioStretch",
    explanationKey: "resultados.scenarioStretchHelp",
  },
];

const GROUPINGS: Array<{ value: PresupuestoGrouping; labelKey: string }> = [
  { value: "quarter", labelKey: "resultados.groupQuarter" },
  { value: "semester", labelKey: "resultados.groupSemester" },
  { value: "year", labelKey: "resultados.groupYear" },
];

export function ResultadosPresupuestoView({
  filters,
  data,
  loading,
  error,
  onDriversSaved,
}: {
  filters: ResultadosFilters;
  data: BudgetProjectionPayload | null;
  loading: boolean;
  error: string | null;
  onDriversSaved?: () => void;
}) {
  const { t } = useLocale();
  const [horizon, setHorizon] = useState<HorizonMonths>(12);
  const [scenario, setScenario] = useState<EscenarioPresupuesto>("base");
  const [incomeAdjustmentPct, setIncomeAdjustmentPct] = useState(0);
  const [grouping, setGrouping] = useState<PresupuestoGrouping>("quarter");
  const model = useMemo(
    () =>
      data
        ? buildPresupuestoViewModel(
            data,
            filters,
            horizon,
            scenario,
            incomeAdjustmentPct,
          )
        : null,
    [data, filters, horizon, scenario, incomeAdjustmentPct],
  );
  const groupedRows = useMemo(
    () => (data ? buildGroupedProjection(data, scenario, incomeAdjustmentPct, grouping) : []),
    [data, scenario, incomeAdjustmentPct, grouping],
  );
  const anchorYear = Number(filters.periodo.slice(0, 4)) || new Date().getFullYear();

  if (loading) {
    return (
      <div className="h-[520px] animate-pulse rounded-card border border-border bg-card" />
    );
  }
  if (error || !model) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm text-desfavorable">
        {error ?? t("resultados.projectionError")}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <article className="rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-xl font-medium text-foreground">
                {t("resultados.budgetProjection")}
              </h3>
              <FavoriteStarButton widgetId={RESULTADOS_FAVORITE.presupuesto} label={t("resultados.budgetProjection")} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {model.hasOfficial
                ? t("resultados.budgetOfficialHelp")
                : t("resultados.budgetForecastHelp", { months: model.sourceMonths })}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-5 border-y border-beige-deep py-4">
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("resultados.horizon")}
            </span>
            <div className="inline-flex h-10 rounded-control border border-input p-0.5">
              {([3, 6, 12] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHorizon(value)}
                  aria-pressed={horizon === value}
                  className={cn(
                    "rounded-control px-3 text-sm",
                    horizon === value
                      ? "bg-secondary font-medium text-clay"
                      : "text-muted-foreground",
                  )}
                >
                  {t("common.months", { value })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("resultados.scenario")}
            </span>
            <div className="inline-flex h-10 rounded-control border border-input p-0.5">
              {SCENARIOS.map((item) => (
                <Tooltip key={item.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setScenario(item.value)}
                      aria-pressed={scenario === item.value}
                      className={cn(
                        "rounded-control px-3 text-sm",
                        scenario === item.value
                          ? "bg-secondary font-medium text-clay"
                          : "text-muted-foreground",
                      )}
                    >
                      {t(item.labelKey)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t(item.explanationKey)}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("resultados.incomeAdjustment", {
                sign: incomeAdjustmentPct > 0 ? "+" : "",
                value: incomeAdjustmentPct,
              })}
            </span>
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={incomeAdjustmentPct}
              disabled={scenario !== "base"}
              onChange={(event) => setIncomeAdjustmentPct(Number(event.target.value))}
              className="h-10 w-full accent-[hsl(var(--brand-clay))] disabled:opacity-40"
            />
          </label>
        </div>

        <div className="mt-5">
          <BudgetDriversForm anio={anchorYear} onSaved={() => onDriversSaved?.()} />
        </div>

        {model.unavailable ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {t("resultados.insufficientProjection")}
          </p>
        ) : (
          <>
            <div className="mt-6">
              <h4 className="font-sans text-base font-medium">{t("resultados.incomeHistoryProjection")}</h4>
              <div className="mt-2 h-[340px] min-w-0">
                <BudgetForecastChart
                  data={model.chart}
                  yTickFormatter={(value) => formatAxisTick(value, filters.units)}
                  valueFormatter={(value) => formatAxisTick(value, filters.units)}
                />
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-beige-deep text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="pb-2 font-medium">{t("resultados.lineItem")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.actual")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.officialBudget")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.projection")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.vsOfficial")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.range")}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((row) => (
                    <tr key={row.key} className="border-b border-beige-deep last:border-0">
                      <td className="py-3 font-sans text-base">{t(`resultados.${row.key === "ingreso" ? "income" : row.key === "costo" ? "cost" : row.key === "gasto" ? "expense" : "ebitda"}`)}</td>
                      <td className="financial-nums py-3 text-right">
                        {formatAxisTick(row.real, filters.units)}
                      </td>
                      <td className="financial-nums py-3 text-right">
                        {row.official == null
                          ? t("resultados.notLoaded")
                          : formatAxisTick(row.official, filters.units)}
                      </td>
                      <td className="financial-nums py-3 text-right font-medium text-clay">
                        {row.projection == null
                          ? "—"
                          : formatAxisTick(row.projection, filters.units)}
                      </td>
                      <td
                        className={cn(
                          "financial-nums py-3 text-right font-medium",
                          row.deltaVsOfficial == null
                            ? "text-muted-foreground"
                            : deltaFavorable(row.key, row.deltaVsOfficial)
                              ? "text-favorable"
                              : "text-desfavorable",
                        )}
                      >
                        {formatDeltaPct(row.deltaVsOfficial)}
                      </td>
                      <td className="financial-nums py-3 text-right text-muted-foreground">
                        {row.low == null || row.high == null
                          ? "—"
                          : `${formatAxisTick(row.low, filters.units)} – ${formatAxisTick(row.high, filters.units)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {model.unavailable ? null : (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="font-sans text-base font-medium">{t("resultados.projectedPl")}</h4>
              <div className="inline-flex h-9 rounded-control border border-input p-0.5">
                {GROUPINGS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setGrouping(item.value)}
                    aria-pressed={grouping === item.value}
                    className={cn(
                      "rounded-control px-3 text-xs",
                      grouping === item.value
                        ? "bg-secondary font-medium text-clay"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-beige-deep text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="pb-2 font-medium">{t("resultados.period")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.income")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.cost")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.expense")}</th>
                    <th className="pb-2 text-right font-medium">{t("resultados.ebitda")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((row) => (
                    <tr key={row.key} className="border-b border-beige-deep last:border-0">
                      <td className="py-2.5 font-sans text-base">{row.label}</td>
                      <td className="financial-nums py-2.5 text-right">
                        {row.ingreso == null ? "—" : formatAxisTick(row.ingreso, filters.units)}
                      </td>
                      <td className="financial-nums py-2.5 text-right">
                        {row.costo == null ? "—" : formatAxisTick(row.costo, filters.units)}
                      </td>
                      <td className="financial-nums py-2.5 text-right">
                        {row.gasto == null ? "—" : formatAxisTick(row.gasto, filters.units)}
                      </td>
                      <td className="financial-nums py-2.5 text-right font-medium text-clay">
                        {row.ebitda == null ? "—" : formatAxisTick(row.ebitda, filters.units)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-5 flex gap-2 text-[13px] text-muted-foreground">
          <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-clay" />
          {t(model.insight.messageKey, model.insight.values?.driver
            ? { ...model.insight.values, driver: t(`resultados.${model.insight.values.driver === "ingreso" ? "income" : model.insight.values.driver === "costo" ? "cost" : "expense"}`) }
            : model.insight.values)}
        </p>

        <div className="mt-5 border-t border-beige-deep pt-4">
          <h4 className="font-sans text-base font-medium">{t("resultados.projectionAssumptions")}</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {model.assumptions.map((assumption) => (
              <li key={assumption.messageKey}>{t(assumption.messageKey, assumption.values)}</li>
            ))}
          </ul>
        </div>
      </article>
    </TooltipProvider>
  );
}
