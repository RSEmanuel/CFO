import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import { round2 } from "@/services/money";

export type ResultadosCategoryName = "Ingreso" | "Costo" | "Gasto";

export type MicroCategoriasIngreso = {
  Dedicado: number;
  "Coordinación marítimos": number;
  "Cross-docking": number;
  "Full truck load": number;
  "Última milla": number;
  "Renta de bodegas": number;
};

export type MonthlyFinancials = {
  periodo: string;
  ingreso_total: number;
  desglose_ingreso: Record<string, number>;
  micro_categorias: Record<string, number>;
  costo_total: number;
  desglose_costo: Record<string, number>;
  gasto_total: number;
  desglose_gasto: Record<string, number>;
  ebitda: number;
  depreciacion_amortizacion?: number;
};

export const INGRESO_KEYS = ["Transporte", "Almacenaje", "Logistica"] as const;
export const MICRO_INGRESO_KEYS = [
  "Dedicado",
  "Coordinación marítimos",
  "Cross-docking",
  "Full truck load",
  "Última milla",
  "Renta de bodegas",
] as const;
export const COSTO_KEYS = ["Personal", "Fletes", "Mantenimiento"] as const;
export const GASTO_KEYS = ["Administracion", "Marketing", "TI"] as const;

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

const DEFAULT_PERIODO = "2025-12";
const DEFAULT_TEMPORALIDAD = "month";

export function seriesKeysFor(category: ResultadosCategoryName, rows: MonthlyFinancials[] = []): string[] {
  const dynamic = Array.from(
    new Set(rows.flatMap((row) => Object.keys(categoryBreakdown(row, category)))),
  );
  if (dynamic.length > 0) return dynamic;
  if (category === "Ingreso") {
    return [...INGRESO_KEYS];
  }
  if (category === "Costo") {
    return [...COSTO_KEYS];
  }
  return [...GASTO_KEYS];
}

export function categoryTotal(row: MonthlyFinancials, category: ResultadosCategoryName): number {
  if (category === "Ingreso") {
    return row.ingreso_total;
  }
  if (category === "Costo") {
    return row.costo_total;
  }
  return row.gasto_total;
}

export function categoryBreakdown(row: MonthlyFinancials, category: ResultadosCategoryName): Record<string, number> {
  if (category === "Ingreso") {
    return { ...row.desglose_ingreso };
  }
  if (category === "Costo") {
    return { ...row.desglose_costo };
  }
  return { ...row.desglose_gasto };
}

export function periodLabel(periodo: string): string {
  const [year, month] = periodo.split("-").map(Number);
  return `${MONTH_ABBR[(month ?? 1) - 1]}-${String(year).slice(-2)}`;
}

/** Ventana TTM de Ingresos vs costos en Destacados. */
export const TREND_WINDOW_MONTHS = 12;

export function trailingMonthlyRows(
  rows: MonthlyFinancials[],
  endPeriod: string | undefined,
  count = TREND_WINDOW_MONTHS,
): MonthlyFinancials[] {
  const sorted = [...rows].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const endIndex = endPeriod ? sorted.findIndex((row) => row.periodo === endPeriod) : sorted.length - 1;
  const cutoff = endIndex >= 0 ? endIndex + 1 : sorted.length;
  return sorted.slice(Math.max(0, cutoff - count), cutoff);
}

function parsePeriodo(periodo: string): { year: number; month: number } {
  const [year, month] = periodo.split("-").map(Number);
  return { year: year || 2025, month: month || 12 };
}

function sumBreakdown(rows: MonthlyFinancials[], category: ResultadosCategoryName): Record<string, number> {
  const keys = seriesKeysFor(category, rows);
  const acc: Record<string, number> = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) {
    const slice = categoryBreakdown(row, category);
    for (const key of keys) {
      acc[key] += slice[key] ?? 0;
    }
  }
  return acc;
}

export type StackedSeriesResult = {
  chartData: Array<Record<string, string | number | null>>;
  seriesKeys: string[];
  headlineLabel: string;
  headlineTotal: number | null;
  comparableLabel: string | null;
  comparableTotal: number | null;
};

function breakdownTotal(breakdown: Record<string, number>): number {
  return round2(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
}

function chartPoint(
  label: string,
  rows: MonthlyFinancials[],
  category: ResultadosCategoryName,
): Record<string, string | number | null> {
  const breakdown = sumBreakdown(rows, category);
  return {
    month: label,
    ...breakdown,
    total: rows.length > 0 ? breakdownTotal(breakdown) : null,
  };
}

function resolveFilters(filters: ResultadosFilters): { temporalidad: string; periodo: string; comparable: string } {
  return {
    temporalidad: filters.temporalidad || DEFAULT_TEMPORALIDAD,
    periodo: filters.periodo || DEFAULT_PERIODO,
    comparable: filters.comparable || "yoy",
  };
}

function findRow(rows: MonthlyFinancials[], periodo: string): MonthlyFinancials | undefined {
  return rows.find((row) => row.periodo === periodo);
}

function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const { year, month } = parsePeriodo(periodo);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function comparableAnchor(
  rows: MonthlyFinancials[],
  periodo: string,
  comparable: string,
): MonthlyFinancials | undefined {
  const target = comparable === "mom" ? shiftPeriodo(periodo, -1) : shiftPeriodo(periodo, -12);
  return findRow(rows, target);
}

export function buildStackedSeries(
  rows: MonthlyFinancials[],
  filters: ResultadosFilters,
  category: ResultadosCategoryName,
): StackedSeriesResult {
  const { temporalidad, periodo, comparable } = resolveFilters(filters);
  const keys = seriesKeysFor(category, rows);
  const { year, month } = parsePeriodo(periodo);
  const comparableRow = comparableAnchor(rows, periodo, comparable);

  if (temporalidad === "year") {
    const years = Array.from(new Set(rows.map((row) => Number(row.periodo.slice(0, 4))))).sort();
    const chartData = years.map((itemYear) => {
      const ofYear = rows.filter((row) => row.periodo.startsWith(`${itemYear}-`));
      return chartPoint(String(itemYear), ofYear, category);
    });
    const ofSelected = rows.filter((row) => row.periodo.startsWith(`${year}-`));
    const priorYear = rows.filter((row) => row.periodo.startsWith(`${year - 1}-`));
    const selectedBreakdown = sumBreakdown(ofSelected, category);
    const headlineTotal = ofSelected.length > 0 ? breakdownTotal(selectedBreakdown) : null;

    return {
      chartData,
      seriesKeys: keys,
      headlineLabel: String(year),
      headlineTotal,
      comparableLabel: comparable === "mom" ? null : year - 1 >= 2024 ? String(year - 1) : null,
      comparableTotal:
        comparable === "yoy" && priorYear.length
          ? priorYear.reduce((sum, row) => sum + categoryTotal(row, category), 0)
          : null,
    };
  }

  if (temporalidad === "quarter") {
    const chartData = [1, 2, 3, 4].map((quarter) => {
      const start = (quarter - 1) * 3 + 1;
      const ofQuarter = rows.filter((row) => {
        const parsed = parsePeriodo(row.periodo);
        return parsed.year === year && parsed.month >= start && parsed.month < start + 3;
      });
      return chartPoint(`Q${quarter}-${String(year).slice(-2)}`, ofQuarter, category);
    });
    const selectedQuarter = Math.ceil(month / 3);
    const ofSelected = rows.filter((row) => {
      const parsed = parsePeriodo(row.periodo);
      const start = (selectedQuarter - 1) * 3 + 1;
      return parsed.year === year && parsed.month >= start && parsed.month < start + 3;
    });

    return {
      chartData,
      seriesKeys: keys,
      headlineLabel: `Q${selectedQuarter}-${String(year).slice(-2)}`,
      headlineTotal:
        ofSelected.length > 0 ? breakdownTotal(sumBreakdown(ofSelected, category)) : null,
      comparableLabel: comparableRow ? periodLabel(comparableRow.periodo) : null,
      comparableTotal: comparableRow ? categoryTotal(comparableRow, category) : null,
    };
  }

  const endIndex = rows.findIndex((row) => row.periodo === periodo);
  const resolvedEnd = endIndex >= 0 ? endIndex : rows.length - 1;
  const startIndex = Math.max(0, resolvedEnd - 11);
  const window = rows.slice(startIndex, resolvedEnd + 1);
  const current = rows[resolvedEnd];

  // Sin filas (tenant sin balanza o datos todavía en vuelo) no hay mes ancla.
  if (!current) {
    return {
      chartData: [],
      seriesKeys: keys,
      headlineLabel: periodLabel(periodo),
      headlineTotal: null,
      comparableLabel: null,
      comparableTotal: null,
    };
  }

  return {
    chartData: window.map((row) => {
      const breakdown = categoryBreakdown(row, category);
      return {
        month: periodLabel(row.periodo),
        ...breakdown,
        total: breakdownTotal(breakdown),
      };
    }),
    seriesKeys: keys,
    headlineLabel: periodLabel(current.periodo),
    headlineTotal: breakdownTotal(categoryBreakdown(current, category)),
    comparableLabel: comparableRow ? periodLabel(comparableRow.periodo) : null,
    comparableTotal: comparableRow ? categoryTotal(comparableRow, category) : null,
  };
}

export type BreakdownSlice = {
  name: string;
  value: number;
  isOther: boolean;
};

export function topBreakdownSlices(
  breakdown: Record<string, number>,
  topN = 5,
): BreakdownSlice[] {
  const entries = Object.entries(breakdown)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = entries
    .slice(0, topN)
    .map(([name, value]) => ({ name, value: round2(value), isOther: false }));
  const rest = entries.slice(topN);
  if (rest.length === 0) {
    return top;
  }
  const otherTotal = round2(rest.reduce((sum, [, value]) => sum + value, 0));
  return [...top, { name: "__other__", value: otherTotal, isOther: true }];
}

/** Rebanadas por debajo de este share se agrupan en «Otros ingresos» para que la dona no colisione etiquetas. */
export const INCOME_PIE_MIN_SHARE = 0.01;

/**
 * Agrupa montos en $0 (ya filtrados) y categorías < 1.0% bajo un único slice `isOther`.
 * Decisión: con un dominante >99% (jul-2026: Vtas 99.2% + Utilidad cambiaria 0.8%)
 * la dona queda Vtas + Otros ingresos; `minAngle` en el gráfico refuerza el arco mínimo.
 */
export function groupSlicesBelowShare(
  slices: BreakdownSlice[],
  minShare = INCOME_PIE_MIN_SHARE,
): BreakdownSlice[] {
  const positive = slices.filter((slice) => slice.value > 0);
  const total = positive.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return [];
  }
  const major: BreakdownSlice[] = [];
  let otherValue = 0;
  for (const slice of positive) {
    if (slice.isOther || slice.value / total < minShare) {
      otherValue += slice.value;
    } else {
      major.push(slice);
    }
  }
  if (otherValue > 0) {
    major.push({ name: "__other__", value: round2(otherValue), isOther: true });
  }
  return major;
}

export function buildIncomeBreakdown(
  rows: MonthlyFinancials[],
  filters: ResultadosFilters,
  topN = 5,
): BreakdownSlice[] {
  const selected = selectedPeriodRows(rows, filters);
  return groupSlicesBelowShare(topBreakdownSlices(sumBreakdown(selected, "Ingreso"), topN));
}

export type DestacadosRubroKey = "ingreso" | "costo" | "gasto" | "utilidad" | "ebitda";

export type DestacadosRubro = {
  key: DestacadosRubroKey;
  title: string;
  value: number | null;
  deltaPct: number | null;
  inverted: boolean;
};

export type DestacadosKpis = {
  rubros: DestacadosRubro[];
  contextLabel: string | null;
};

type RubroTotals = {
  ingreso: number;
  costo: number;
  gasto: number;
  ebitda: number;
};

function emptyTotals(): RubroTotals {
  return { ingreso: 0, costo: 0, gasto: 0, ebitda: 0 };
}

function sumRubros(rows: MonthlyFinancials[]): RubroTotals {
  return rows.reduce((acc, row) => {
    acc.ingreso += row.ingreso_total;
    acc.costo += row.costo_total;
    acc.gasto += row.gasto_total;
    acc.ebitda += row.ebitda;
    return acc;
  }, emptyTotals());
}

function totalsFromRow(row: MonthlyFinancials | undefined): RubroTotals | null {
  if (!row) {
    return null;
  }
  return {
    ingreso: row.ingreso_total,
    costo: row.costo_total,
    gasto: row.gasto_total,
    ebitda: row.ebitda,
  };
}

function deltaPct(actual: number, prior: number | null | undefined): number | null {
  if (prior == null || Math.abs(prior) < 0.01) {
    return null;
  }
  return round2(((actual - prior) / Math.abs(prior)) * 100);
}

function rowsInQuarter(rows: MonthlyFinancials[], year: number, quarter: number): MonthlyFinancials[] {
  const start = (quarter - 1) * 3 + 1;
  return rows.filter((row) => {
    const parsed = parsePeriodo(row.periodo);
    return parsed.year === year && parsed.month >= start && parsed.month < start + 3;
  });
}

export function selectedPeriodRows(rows: MonthlyFinancials[], filters: ResultadosFilters): MonthlyFinancials[] {
  const { temporalidad, periodo } = resolveFilters(filters);
  const { year, month } = parsePeriodo(periodo);

  if (temporalidad === "year") {
    return rows.filter((row) => row.periodo.startsWith(`${year}-`));
  }
  if (temporalidad === "quarter") {
    return rowsInQuarter(rows, year, Math.ceil(month / 3));
  }
  const current = findRow(rows, periodo) ?? rows[rows.length - 1];
  return current ? [current] : [];
}

export type DestacadosPeriodTotals = {
  ingreso_total: number;
  costo_total: number;
  gasto_total: number;
  ebitda: number;
  depreciacion_amortizacion: number;
  micro_categorias: Record<string, number>;
  desglose_ingreso: Record<string, number>;
  desglose_costo: Record<string, number>;
  desglose_gasto: Record<string, number>;
};

function emptyPeriodTotals(): DestacadosPeriodTotals {
  return {
    ingreso_total: 0,
    costo_total: 0,
    gasto_total: 0,
    ebitda: 0,
    depreciacion_amortizacion: 0,
    micro_categorias: {},
    desglose_ingreso: {},
    desglose_costo: {},
    desglose_gasto: {},
  };
}

export function getDestacadosPeriodTotals(
  rows: MonthlyFinancials[],
  filters: ResultadosFilters,
): DestacadosPeriodTotals {
  const acc = emptyPeriodTotals();
  for (const row of selectedPeriodRows(rows, filters)) {
    acc.ingreso_total += row.ingreso_total;
    acc.costo_total += row.costo_total;
    acc.gasto_total += row.gasto_total;
    acc.ebitda += row.ebitda;
    acc.depreciacion_amortizacion += row.depreciacion_amortizacion ?? 0;
    for (const [key, value] of Object.entries(row.micro_categorias)) {
      acc.micro_categorias[key] = (acc.micro_categorias[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(row.desglose_ingreso)) {
      acc.desglose_ingreso[key] = (acc.desglose_ingreso[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(row.desglose_costo)) {
      acc.desglose_costo[key] = (acc.desglose_costo[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(row.desglose_gasto)) {
      acc.desglose_gasto[key] = (acc.desglose_gasto[key] ?? 0) + value;
    }
  }
  return acc;
}

function toRubros(current: RubroTotals, prior: RubroTotals | null): DestacadosRubro[] {
  const defs: Array<{ key: Exclude<DestacadosRubroKey, "utilidad">; title: string; inverted: boolean }> = [
    { key: "ingreso", title: "Ingreso", inverted: false },
    { key: "costo", title: "Costo", inverted: true },
    { key: "gasto", title: "Gasto", inverted: true },
    { key: "ebitda", title: "EBITDA", inverted: false },
  ];
  return defs.map((def) => ({
    ...def,
    value: current[def.key],
    deltaPct: deltaPct(current[def.key], prior?.[def.key]),
  }));
}

export function getDestacadosKpis(rows: MonthlyFinancials[], filters: ResultadosFilters): DestacadosKpis {
  const { temporalidad, periodo, comparable } = resolveFilters(filters);
  const { year, month } = parsePeriodo(periodo);

  if (temporalidad === "year") {
    const ofSelected = rows.filter((row) => row.periodo.startsWith(`${year}-`));
    const priorYear = comparable === "yoy" ? rows.filter((row) => row.periodo.startsWith(`${year - 1}-`)) : [];
    const current = sumRubros(ofSelected);
    const prior = comparable === "yoy" && priorYear.length ? sumRubros(priorYear) : null;
    return {
      rubros: toRubros(current, prior),
      contextLabel: prior ? "vs año anterior" : null,
    };
  }

  if (temporalidad === "quarter") {
    const selectedQuarter = Math.ceil(month / 3);
    const ofSelected = rowsInQuarter(rows, year, selectedQuarter);
    const current = sumRubros(ofSelected);
    const priorRows =
      comparable === "yoy"
        ? rowsInQuarter(rows, year - 1, selectedQuarter)
        : selectedQuarter === 1
          ? rowsInQuarter(rows, year - 1, 4)
          : rowsInQuarter(rows, year, selectedQuarter - 1);
    const prior = priorRows.length ? sumRubros(priorRows) : null;
    return {
      rubros: toRubros(current, prior),
      contextLabel: prior ? (comparable === "yoy" ? "vs año anterior" : "vs trimestre anterior") : null,
    };
  }

  const currentRow = findRow(rows, periodo) ?? rows[rows.length - 1];
  const priorRow = currentRow ? comparableAnchor(rows, currentRow.periodo, comparable) : undefined;
  return {
    rubros: toRubros(totalsFromRow(currentRow) ?? emptyTotals(), totalsFromRow(priorRow)),
    contextLabel: priorRow ? (comparable === "mom" ? "vs mes anterior" : "vs año anterior") : null,
  };
}
