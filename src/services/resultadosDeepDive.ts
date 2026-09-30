import { periodLabel, type MonthlyFinancials } from "@/services/financialDataTransformer";
import { MONEY_TOLERANCE, round2 } from "@/services/money";

function parsePeriodo(periodo: string): { year: number; month: number } {
  const [year, month] = periodo.split("-").map(Number);
  return { year: year || 2025, month: month || 12 };
}

function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const { year, month } = parsePeriodo(periodo);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function findRow(data: MonthlyFinancials[], periodo: string): MonthlyFinancials | undefined {
  return data.find((row) => row.periodo === periodo);
}

function quarterOf(month: number): number {
  return Math.ceil(month / 3);
}

function quarterLabel(year: number, quarter: number): string {
  return `Q${quarter}-${String(year).slice(-2)}`;
}

function monthsForQuarter(data: MonthlyFinancials[], year: number, quarter: number): MonthlyFinancials[] {
  const start = (quarter - 1) * 3 + 1;
  return data.filter((row) => {
    const parsed = parsePeriodo(row.periodo);
    return parsed.year === year && parsed.month >= start && parsed.month < start + 3;
  });
}

function monthsForYear(data: MonthlyFinancials[], year: number): MonthlyFinancials[] {
  return data.filter((row) => parsePeriodo(row.periodo).year === year);
}

function priorQuarter(year: number, quarter: number): { year: number; quarter: number } {
  if (quarter === 1) {
    return { year: year - 1, quarter: 4 };
  }
  return { year, quarter: quarter - 1 };
}

export type CostoMixMode = "mom" | "qoq" | "yoy";

export type CostoMixCompareRow = {
  key: string;
  label: string;
  actualPct: number | null;
  priorPct: number | null;
  deltaPp: number | null;
};

export type CostoMixInsight = {
  label: string;
  deltaPp: number;
  favorable: boolean;
  messageKey: string;
  values: Record<string, string | number>;
};

export type CostoMixCompareModel = {
  actualLabel: string;
  priorLabel: string | null;
  rows: CostoMixCompareRow[];
  insight: CostoMixInsight | null;
};

function yearSpanLabel(year: number): string {
  return `Ene–Dic ${String(year).slice(-2)}`;
}

function costSharePct(rows: MonthlyFinancials[], key: string): number | null {
  if (rows.length === 0) {
    return null;
  }
  const ingreso = rows.reduce((total, row) => total + row.ingreso_total, 0);
  if (Math.abs(ingreso) < MONEY_TOLERANCE) {
    return null;
  }
  const costo = rows.reduce((total, row) => total + (row.desglose_costo[key] ?? 0), 0);
  return round2((costo / ingreso) * 100);
}

function costoMixWindows(
  data: MonthlyFinancials[],
  periodo: string,
  mode: CostoMixMode,
): { actualRows: MonthlyFinancials[]; priorRows: MonthlyFinancials[]; actualLabel: string; priorLabel: string | null } {
  const { year, month } = parsePeriodo(periodo);

  if (mode === "yoy") {
    const actualRows = monthsForYear(data, year);
    const priorRows = monthsForYear(data, year - 1);
    return {
      actualRows,
      priorRows,
      actualLabel: yearSpanLabel(year),
      priorLabel: priorRows.length ? yearSpanLabel(year - 1) : null,
    };
  }

  if (mode === "qoq") {
    const quarter = quarterOf(month);
    const prior = priorQuarter(year, quarter);
    const actualRows = monthsForQuarter(data, year, quarter);
    const priorRows = monthsForQuarter(data, prior.year, prior.quarter);
    return {
      actualRows,
      priorRows,
      actualLabel: quarterLabel(year, quarter),
      priorLabel: priorRows.length ? quarterLabel(prior.year, prior.quarter) : null,
    };
  }

  const actualRow = findRow(data, periodo);
  const priorRow = findRow(data, shiftPeriodo(periodo, -1));
  return {
    actualRows: actualRow ? [actualRow] : [],
    priorRows: priorRow ? [priorRow] : [],
    actualLabel: periodLabel(periodo),
    priorLabel: priorRow ? periodLabel(priorRow.periodo) : null,
  };
}

function buildCostoMixInsight(rows: CostoMixCompareRow[]): CostoMixInsight | null {
  const ranked = rows.filter((row): row is CostoMixCompareRow & { deltaPp: number } => row.deltaPp != null);
  if (ranked.length === 0) {
    return null;
  }
  const winner = ranked.reduce((best, row) => (Math.abs(row.deltaPp) > Math.abs(best.deltaPp) ? row : best));
  const verbKey = winner.deltaPp > 0 ? "resultados.increased" : "resultados.decreased";
  const sign = winner.deltaPp > 0 ? "+" : winner.deltaPp < 0 ? "-" : "";
  return {
    label: winner.label,
    deltaPp: winner.deltaPp,
    favorable: winner.deltaPp < 0,
    messageKey: "resultados.costMixInsight",
    values: {
      label: winner.label,
      verb: verbKey,
      value: `${sign}${Math.abs(winner.deltaPp).toFixed(1)}`,
    },
  };
}

export function buildCostoMixCompare(
  data: MonthlyFinancials[],
  periodo: string,
  mode: CostoMixMode,
): CostoMixCompareModel {
  const { actualRows, priorRows, actualLabel, priorLabel } = costoMixWindows(data, periodo, mode);
  const keys = Array.from(new Set(data.flatMap((row) => Object.keys(row.desglose_costo))));
  const rows: CostoMixCompareRow[] = keys.map((key) => {
    const actualPct = costSharePct(actualRows, key);
    const priorPct = priorLabel == null ? null : costSharePct(priorRows, key);
    const deltaPp = actualPct != null && priorPct != null ? round2(actualPct - priorPct) : null;
    return {
      key,
      label: key,
      actualPct,
      priorPct,
      deltaPp,
    };
  });

  return {
    actualLabel,
    priorLabel,
    rows,
    insight: priorLabel == null ? null : buildCostoMixInsight(rows),
  };
}
