import type { ResultadosFilters } from "@/components/resultados/resultados-filter-bar";
import type {
  BudgetProjectionPayload,
  OfficialBudgetMonth,
} from "@/services/budgetProjectionService";
import { periodLabel } from "@/services/financialDataTransformer";
import { MONEY_TOLERANCE, round2 } from "@/services/money";

export type PresupuestoRubroKey = "ingreso" | "costo" | "gasto" | "ebitda";
export type HorizonMonths = 3 | 6 | 12;
export type EscenarioPresupuesto = "base" | "conservador" | "estirado";
export type ResultadosMessage = { messageKey: string; values?: Record<string, string | number> };

export type PresupuestoRow = {
  key: PresupuestoRubroKey;
  label: string;
  real: number;
  official: number | null;
  projection: number | null;
  deltaVsOfficial: number | null;
  low: number | null;
  high: number | null;
};

export type PresupuestoChartPoint = {
  periodo: string;
  label: string;
  kind: "real" | "projection";
  real: number | null;
  projection: number | null;
  low: number | null;
  range: number | null;
};

export type PresupuestoViewModel = {
  hasOfficial: boolean;
  sourceMonths: number;
  rows: PresupuestoRow[];
  chart: PresupuestoChartPoint[];
  insight: ResultadosMessage;
  assumptions: ResultadosMessage[];
  unavailable: boolean;
};

const RUBROS: Array<{ key: PresupuestoRubroKey; label: string }> = [
  { key: "ingreso", label: "Ingreso" },
  { key: "costo", label: "Costo" },
  { key: "gasto", label: "Gasto" },
  { key: "ebitda", label: "EBITDA" },
];

function monthsForTable(temporalidad: string): number {
  if (temporalidad === "quarter") {
    return 3;
  }
  if (temporalidad === "year") {
    return 12;
  }
  return 1;
}

function actualWindow(
  history: BudgetProjectionPayload["history"],
  filters: ResultadosFilters,
) {
  const [year, month] = filters.periodo.split("-").map(Number);
  if (filters.temporalidad === "year") {
    return history.filter((row) => row.periodo.startsWith(`${year}-`));
  }
  if (filters.temporalidad === "quarter") {
    const quarter = Math.ceil((month || 1) / 3);
    return history.filter((row) => {
      const [rowYear, rowMonth] = row.periodo.split("-").map(Number);
      return rowYear === year && Math.ceil((rowMonth || 1) / 3) === quarter;
    });
  }
  return history.filter((row) => row.periodo === filters.periodo);
}

function sumValues(
  values: Array<number | null | undefined>,
): number | null {
  if (values.length === 0 || values.some((value) => value == null)) {
    return null;
  }
  return round2(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function scenarioMonth(
  payload: BudgetProjectionPayload,
  key: PresupuestoRubroKey,
  index: number,
  scenario: EscenarioPresupuesto,
  incomeAdjustmentPct: number,
): number | null {
  const ingreso = payload.projection.rubros.ingreso.months[index];
  const costo = payload.projection.rubros.costo.months[index];
  const gasto = payload.projection.rubros.gasto.months[index];
  if (!ingreso || !costo || !gasto) {
    return null;
  }

  let ingresoValue = ingreso.p50;
  let costoValue = costo.p50;
  let gastoValue = gasto.p50;
  if (scenario === "conservador") {
    ingresoValue = ingreso.p20;
    costoValue = costo.p80;
    gastoValue = gasto.p80;
  } else if (scenario === "estirado") {
    ingresoValue = ingreso.p80;
    costoValue = costo.p20;
    gastoValue = gasto.p20;
  } else {
    ingresoValue = round2(ingresoValue * (1 + incomeAdjustmentPct / 100));
  }

  if (key === "ingreso") return ingresoValue;
  if (key === "costo") return costoValue;
  if (key === "gasto") return gastoValue;
  return round2(ingresoValue - costoValue - gastoValue);
}

function officialForWindow(
  official: OfficialBudgetMonth[],
  periods: string[],
  key: PresupuestoRubroKey,
): number | null {
  const rows = periods.map((periodo) =>
    official.find((row) => row.periodo === periodo),
  );
  if (rows.some((row) => !row)) {
    return null;
  }
  return sumValues(rows.map((row) => row?.[key]));
}

function delta(projection: number | null, official: number | null): number | null {
  if (
    projection == null ||
    official == null ||
    Math.abs(official) < MONEY_TOLERANCE
  ) {
    return null;
  }
  return (projection - official) / Math.abs(official);
}

function chartPoints(
  payload: BudgetProjectionPayload,
  horizon: HorizonMonths,
  scenario: EscenarioPresupuesto,
  incomeAdjustmentPct: number,
): PresupuestoChartPoint[] {
  const historical = payload.history.slice(-12).map((row) => ({
    periodo: row.periodo,
    label: periodLabel(row.periodo),
    kind: "real" as const,
    real: row.ingreso,
    projection: null,
    low: null,
    range: null,
  }));
  const forecast = payload.projection.rubros.ingreso.months
    .slice(0, horizon)
    .map((month, index) => {
      const projected = scenarioMonth(
        payload,
        "ingreso",
        index,
        scenario,
        incomeAdjustmentPct,
      );
      return {
        periodo: month.periodo,
        label: periodLabel(month.periodo),
        kind: "projection" as const,
        real: null,
        projection: projected,
        low: month.p20,
        range: round2(month.p80 - month.p20),
      };
    });
  return [...historical, ...forecast];
}

function assumptions(payload: BudgetProjectionPayload): ResultadosMessage[] {
  const method: ResultadosMessage =
    payload.projection.rubros.ingreso.method === "holt_winters"
      ? { messageKey: "resultados.assumptions.smoothing" }
      : { messageKey: "resultados.assumptions.seasonal" };
  const items = [
    method,
    { messageKey: "resultados.assumptions.ebitdaIdentity" },
    { messageKey: "resultados.assumptions.widerRange" },
  ];
  if (payload.status === "insufficient_history") {
    items.push({ messageKey: "resultados.assumptions.insufficientHistory" });
  }
  return items;
}

function buildInsight(
  payload: BudgetProjectionPayload,
  rows: PresupuestoRow[],
): ResultadosMessage {
  const volatile = (payload.projection.rubros.ingreso.mapeHoldout ?? 0) > 0.15;
  const drivers = rows
    .filter((row) => row.key !== "ebitda" && row.projection != null)
    .map((row) => {
      const normalizedReal = row.real;
      const raw = (row.projection ?? 0) - normalizedReal;
      return {
        key: row.key,
        impact: row.key === "ingreso" ? raw : -raw,
      };
    });
  const driver = drivers.sort(
    (a, b) => Math.abs(b.impact) - Math.abs(a.impact),
  )[0];
  return {
    messageKey: volatile
      ? driver
        ? "resultados.budgetInsightVolatileDriver"
        : "resultados.budgetInsightVolatile"
      : driver
        ? "resultados.budgetInsightDriver"
        : "resultados.budgetInsight",
    values: driver ? { driver: driver.key } : undefined,
  };
}

export type PresupuestoGrouping = "quarter" | "semester" | "year";

export type PresupuestoGroupRow = {
  key: string;
  label: string;
  ingreso: number | null;
  costo: number | null;
  gasto: number | null;
  ebitda: number | null;
};

function groupSlotOf(periodo: string, grouping: PresupuestoGrouping): { key: string; label: string } {
  const [yearRaw, monthRaw] = periodo.split("-").map(Number);
  const year = yearRaw || 0;
  const month = monthRaw || 1;
  const yy = String(year).slice(-2);
  if (grouping === "quarter") {
    const quarter = Math.ceil(month / 3);
    return { key: `${year}-Q${quarter}`, label: `Q${quarter}-${yy}` };
  }
  if (grouping === "semester") {
    const semester = month <= 6 ? 1 : 2;
    return { key: `${year}-S${semester}`, label: `S${semester}-${yy}` };
  }
  return { key: String(year), label: String(year) };
}

export function buildGroupedProjection(
  payload: BudgetProjectionPayload,
  scenario: EscenarioPresupuesto,
  incomeAdjustmentPct: number,
  grouping: PresupuestoGrouping,
): PresupuestoGroupRow[] {
  const months = payload.projection.rubros.ingreso.months;
  const groups = new Map<string, PresupuestoGroupRow & { count: number }>();
  months.forEach((month, index) => {
    const slot = groupSlotOf(month.periodo, grouping);
    const current = groups.get(slot.key) ?? {
      key: slot.key,
      label: slot.label,
      ingreso: 0,
      costo: 0,
      gasto: 0,
      ebitda: 0,
      count: 0,
    };
    for (const key of ["ingreso", "costo", "gasto", "ebitda"] as const) {
      const value = scenarioMonth(payload, key, index, scenario, incomeAdjustmentPct);
      if (value == null || current[key] == null) {
        current[key] = null;
      } else {
        current[key] = round2(current[key] + value);
      }
    }
    current.count += 1;
    groups.set(slot.key, current);
  });
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ count: _count, ...row }) => row);
}

export function buildPresupuestoViewModel(
  payload: BudgetProjectionPayload,
  filters: ResultadosFilters,
  horizon: HorizonMonths,
  scenario: EscenarioPresupuesto,
  incomeAdjustmentPct: number,
): PresupuestoViewModel {
  const tableMonths = monthsForTable(filters.temporalidad);
  const periods = payload.projection.rubros.ingreso.months
    .slice(0, tableMonths)
    .map((month) => month.periodo);
  const actual = actualWindow(payload.history, filters);
  const rows = RUBROS.map(({ key, label }) => {
    const real = round2(actual.reduce((sum, row) => sum + row[key], 0));
    const projection = sumValues(
      Array.from({ length: tableMonths }, (_, index) =>
        scenarioMonth(payload, key, index, scenario, incomeAdjustmentPct),
      ),
    );
    const forecast = payload.projection.rubros[key].months.slice(0, tableMonths);
    const low = sumValues(forecast.map((month) => month.p20));
    const high = sumValues(forecast.map((month) => month.p80));
    const official = officialForWindow(payload.official, periods, key);
    return {
      key,
      label,
      real,
      official,
      projection,
      deltaVsOfficial: delta(projection, official),
      low,
      high,
    };
  });

  return {
    hasOfficial: rows.some((row) => row.official != null),
    sourceMonths: payload.sourceMonths,
    rows,
    chart: chartPoints(payload, horizon, scenario, incomeAdjustmentPct),
    insight: buildInsight(payload, rows),
    assumptions: assumptions(payload),
    unavailable:
      payload.projection.rubros.ingreso.method === "unavailable" ||
      payload.projection.rubros.ingreso.months.length === 0,
  };
}
