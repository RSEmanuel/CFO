import { dateLocale, type Locale } from "@/i18n/config";
import { monthLabelKey } from "@/i18n/format";
import {
  categoryTotal,
  monthlySeriesTotal,
  type MonthlyFinancials,
  type ResultadosCategoryName,
} from "@/services/financialDataTransformer";
import type { BudgetProjectionPayload } from "@/services/budgetProjectionService";
import { nowcastRubro } from "@/services/forecast/budgetProjection";

export type KpiCard = {
  key: "promedio3M" | "mesAnterior" | "anoAnterior" | "trimAnterior" | "presupuesto";
  title: string;
  value: number | null;
  deltaPct: number | null;
};

export type TopKpis = {
  currentMonthValue: number | null;
  cards: KpiCard[];
};

/** Orden de las temporalidades, sin presupuesto. El mes seleccionado va primero. */
const TEMPORAL_KPI_ORDER = ["mesAnterior", "promedio3M", "anoAnterior", "trimAnterior"] as const;

export type CategoryTemporalKey = "mesActual" | (typeof TEMPORAL_KPI_ORDER)[number];

export type CategoryTemporalCard = {
  key: CategoryTemporalKey;
  titleKey: string;
  value: number | null;
  deltaPct: number | null;
  periodLabel: string;
};

type Translate = (key: string) => string;

const TEMPORAL_TITLE_KEY: Record<(typeof TEMPORAL_KPI_ORDER)[number], string> = {
  mesAnterior: "resultados.previousMonth",
  promedio3M: "resultados.average3m",
  anoAnterior: "resultados.previousYear",
  trimAnterior: "resultados.previousQuarter",
};

const MONTH_TITLE_KEY: Record<ResultadosCategoryName, string> = {
  Ingreso: "resultados.monthIncome",
  Costo: "resultados.monthCost",
  Gasto: "resultados.monthExpense",
};

function parsePeriodo(periodo: string): { year: number; month: number } {
  const [year, month] = periodo.split("-").map(Number);
  return { year: year || 2025, month: month || 12 };
}

function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const { year, month } = parsePeriodo(periodo);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function totalAt(
  data: MonthlyFinancials[],
  category: ResultadosCategoryName,
  periodo: string,
  totalsOverride?: Readonly<Record<string, number>>,
): number | null {
  if (totalsOverride) {
    return Object.prototype.hasOwnProperty.call(totalsOverride, periodo) ? totalsOverride[periodo] ?? null : null;
  }
  const row = data.find((item) => item.periodo === periodo);
  return row ? categoryTotal(row, category) : null;
}

function deltaVsCurrent(current: number | null, kpi: number | null): number | null {
  if (current == null || kpi == null || Math.abs(kpi) < 0.0001) {
    return null;
  }
  return (current - kpi) / Math.abs(kpi);
}

function monthPhrase(periodo: string, t: Translate, locale: Locale, lower: boolean): { name: string; year: number } {
  const { year, month } = parsePeriodo(periodo);
  const raw = t(monthLabelKey(month - 1));
  return { name: lower ? raw.toLocaleLowerCase(dateLocale(locale)) : raw, year };
}

function singleMonthLabel(periodo: string, t: Translate, locale: Locale): string {
  const { name, year } = monthPhrase(periodo, t, locale, false);
  return `${name} ${year}`;
}

function rangeLabel(start: string, end: string, t: Translate, locale: Locale): string {
  const from = monthPhrase(start, t, locale, false);
  const to = monthPhrase(end, t, locale, true);
  if (from.year === to.year) {
    return `${from.name}–${to.name} ${to.year}`;
  }
  return `${from.name} ${from.year}–${to.name} ${to.year}`;
}

export function temporalPeriodLabels(
  periodo: string,
  t: Translate,
  locale: Locale,
): Record<CategoryTemporalKey, string> {
  const priorQuarter = previousQuarterMonths(periodo);
  return {
    mesActual: singleMonthLabel(periodo, t, locale),
    mesAnterior: singleMonthLabel(shiftPeriodo(periodo, -1), t, locale),
    promedio3M: rangeLabel(shiftPeriodo(periodo, -2), periodo, t, locale),
    anoAnterior: singleMonthLabel(shiftPeriodo(periodo, -12), t, locale),
    trimAnterior: priorQuarter ? rangeLabel(priorQuarter[0], priorQuarter[2], t, locale) : "",
  };
}

export function categoryTemporalCards(
  kpis: TopKpis,
  periodo: string,
  category: ResultadosCategoryName,
  t: Translate,
  locale: Locale,
): CategoryTemporalCard[] {
  const labels = temporalPeriodLabels(periodo, t, locale);
  const byKey = new Map(kpis.cards.map((card) => [card.key, card]));
  return [
    {
      key: "mesActual",
      titleKey: MONTH_TITLE_KEY[category],
      value: kpis.currentMonthValue,
      deltaPct: null,
      periodLabel: labels.mesActual,
    },
    ...TEMPORAL_KPI_ORDER.map((key) => {
      const card = byKey.get(key);
      return {
        key,
        titleKey: TEMPORAL_TITLE_KEY[key],
        value: card?.value ?? null,
        deltaPct: card?.deltaPct ?? null,
        periodLabel: labels[key],
      };
    }),
  ];
}

function previousQuarterMonths(periodo: string): [string, string, string] | null {
  const { year, month } = parsePeriodo(periodo);
  const currentQuarter = Math.ceil(month / 3);
  const priorQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const priorYear = currentQuarter === 1 ? year - 1 : year;
  const startMonth = (priorQuarter - 1) * 3 + 1;
  return [
    `${priorYear}-${String(startMonth).padStart(2, "0")}`,
    `${priorYear}-${String(startMonth + 1).padStart(2, "0")}`,
    `${priorYear}-${String(startMonth + 2).padStart(2, "0")}`,
  ];
}

function sumThree(
  data: MonthlyFinancials[],
  category: ResultadosCategoryName,
  periodos: [string, string, string],
  totalsOverride?: Readonly<Record<string, number>>,
): number | null {
  const values = periodos.map((item) => totalAt(data, category, item, totalsOverride));
  if (values.some((value) => value == null)) {
    return null;
  }
  return (values[0] ?? 0) + (values[1] ?? 0) + (values[2] ?? 0);
}

export function calculateTopKPIs(
  data: MonthlyFinancials[],
  category: ResultadosCategoryName,
  selectedPeriod: string,
  budgetPayload?: BudgetProjectionPayload | null,
  totalsOverride?: Readonly<Record<string, number>>,
): TopKpis {
  const currentMonthValue = totalAt(data, category, selectedPeriod, totalsOverride);
  const mesAnterior = totalAt(data, category, shiftPeriodo(selectedPeriod, -1), totalsOverride);
  const anoAnterior = totalAt(data, category, shiftPeriodo(selectedPeriod, -12), totalsOverride);
  const m2 = totalAt(data, category, shiftPeriodo(selectedPeriod, -2), totalsOverride);
  const promedio3M =
    currentMonthValue != null && mesAnterior != null && m2 != null
      ? (currentMonthValue + mesAnterior + m2) / 3
      : null;
  const priorQuarter = previousQuarterMonths(selectedPeriod);
  const trimAnterior = priorQuarter ? sumThree(data, category, priorQuarter, totalsOverride) : null;
  const key =
    category === "Ingreso" ? "ingreso" : category === "Costo" ? "costo" : "gasto";
  const officialMonth = budgetPayload?.official.find(
    (row) => row.periodo === selectedPeriod,
  );
  const presupuestoOficial = officialMonth?.[key] ?? null;
  const proyeccion =
    presupuestoOficial == null && budgetPayload
      ? nowcastRubro(budgetPayload.history, key, selectedPeriod)
      : null;
  const presupuesto = presupuestoOficial ?? proyeccion;
  const presupuestoTitle =
    presupuestoOficial != null ? "Presupuesto oficial" : "Proyección del mes";

  const cards: KpiCard[] = [
    { key: "promedio3M", title: "Promedio 3M", value: promedio3M, deltaPct: deltaVsCurrent(currentMonthValue, promedio3M) },
    { key: "mesAnterior", title: "Mes anterior", value: mesAnterior, deltaPct: deltaVsCurrent(currentMonthValue, mesAnterior) },
    { key: "anoAnterior", title: "Año anterior", value: anoAnterior, deltaPct: deltaVsCurrent(currentMonthValue, anoAnterior) },
    { key: "trimAnterior", title: "Trim anterior", value: trimAnterior, deltaPct: deltaVsCurrent(currentMonthValue, trimAnterior) },
    { key: "presupuesto", title: presupuestoTitle, value: presupuesto, deltaPct: deltaVsCurrent(currentMonthValue, presupuesto) },
  ];

  return { currentMonthValue, cards };
}

export type YearToDate = {
  /** Suma de enero al mes seleccionado con los meses que sí tienen datos; null si no hay ninguno. */
  value: number | null;
  /** Meses de enero al mes seleccionado, en formato YYYY-MM. */
  periodos: string[];
  /** Meses del rango sin datos. Si hay alguno, el acumulado está incompleto. */
  missing: string[];
  /** Mismo rango del año anterior; solo si el actual y el anterior están completos. */
  priorValue: number | null;
  deltaPct: number | null;
};

function yearToDatePeriodos(periodo: string): string[] {
  const { year, month } = parsePeriodo(periodo);
  return Array.from({ length: month }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function sumSeries(
  data: MonthlyFinancials[],
  category: ResultadosCategoryName,
  periodos: string[],
): { total: number | null; missing: string[] } {
  const byPeriodo = new Map(data.map((row) => [row.periodo, row]));
  let total = 0;
  let found = 0;
  const missing: string[] = [];
  for (const periodo of periodos) {
    const row = byPeriodo.get(periodo);
    if (!row) {
      missing.push(periodo);
      continue;
    }
    total += monthlySeriesTotal(row, category);
    found += 1;
  }
  return { total: found > 0 ? Math.round(total * 100) / 100 : null, missing };
}

/**
 * Acumulado del año: de enero al mes seleccionado, inclusive, con el mismo total
 * mensual que dibuja la serie. No rellena meses faltantes: los reporta en `missing`.
 */
export function calculateYearToDate(
  data: MonthlyFinancials[],
  category: ResultadosCategoryName,
  selectedPeriod: string,
): YearToDate {
  const periodos = yearToDatePeriodos(selectedPeriod);
  const current = sumSeries(data, category, periodos);
  const prior = sumSeries(data, category, periodos.map((periodo) => shiftPeriodo(periodo, -12)));
  const priorValue = current.missing.length === 0 && prior.missing.length === 0 ? prior.total : null;
  return {
    value: current.total,
    periodos,
    missing: current.missing,
    priorValue,
    deltaPct: priorValue == null ? null : deltaVsCurrent(current.total, priorValue),
  };
}

/** Etiquetas del acumulado: «Enero–julio 2026» y el mismo rango del año anterior. */
export function yearToDateLabels(
  periodo: string,
  t: Translate,
  locale: Locale,
): { current: string; prior: string } {
  const { year, month } = parsePeriodo(periodo);
  const start = `${year}-01`;
  const label = (from: string, to: string) =>
    month === 1 ? singleMonthLabel(to, t, locale) : rangeLabel(from, to, t, locale);
  return {
    current: label(start, periodo),
    prior: label(shiftPeriodo(start, -12), shiftPeriodo(periodo, -12)),
  };
}

/** Lista de meses faltantes en texto: «marzo y abril 2026». */
export function missingMonthsLabel(periodos: string[], t: Translate, locale: Locale): string {
  const names = periodos.map((periodo) => monthPhrase(periodo, t, locale, true));
  if (names.length === 0) return "";
  const year = names[names.length - 1]?.year;
  const list = names.map((item) => item.name);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} ${t("common.and")} ${list.at(-1)}`;
  return `${joined} ${year}`;
}
