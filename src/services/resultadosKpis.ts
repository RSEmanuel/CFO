import {
  categoryTotal,
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
