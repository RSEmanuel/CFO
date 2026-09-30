import type { MonthlyFinancials } from "../financialDataTransformer";
import { round2, toNumber } from "../money";
import type { BalanzaPnlLike, MonthlyPnlPoint, SeriesBuildResult } from "./types";

function padPeriodo(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

function pygIngreso(debe: unknown, haber: unknown): number {
  return round2(toNumber(haber as number) - toNumber(debe as number));
}

function pygCostoGasto(debe: unknown, haber: unknown): number {
  return round2(toNumber(debe as number) - toNumber(haber as number));
}

export function fromMockFinancials(rows: MonthlyFinancials[]): MonthlyPnlPoint[] {
  return [...rows]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((row) => ({
      periodo: row.periodo,
      ingreso: round2(row.ingreso_total),
      costo: round2(row.costo_total),
      gasto: round2(row.gasto_total),
      ebitda: round2(row.ebitda),
      officialIngreso: 0,
      officialCosto: 0,
      officialGasto: 0,
    }));
}

export function fromBalanzaPnl(rows: BalanzaPnlLike[]): MonthlyPnlPoint[] {
  const byPeriod = new Map<string, MonthlyPnlPoint>();
  for (const fila of rows) {
    const periodo = padPeriodo(fila.anio, fila.periodo);
    const current = byPeriod.get(periodo) ?? {
      periodo,
      ingreso: 0,
      costo: 0,
      gasto: 0,
      ebitda: 0,
      officialIngreso: 0,
      officialCosto: 0,
      officialGasto: 0,
    };
    const budget = toNumber(fila.montoPresupuestado as number);
    const official = Number.isFinite(budget) ? budget : 0;
    if (fila.categoriaMaestra === "Ingreso") {
      current.ingreso = round2(current.ingreso + pygIngreso(fila.debe, fila.haber));
      current.officialIngreso = round2(current.officialIngreso + official);
    } else if (fila.categoriaMaestra === "COGS") {
      current.costo = round2(current.costo + pygCostoGasto(fila.debe, fila.haber));
      current.officialCosto = round2(current.officialCosto + official);
    } else if (fila.categoriaMaestra === "OpEx") {
      current.gasto = round2(current.gasto + pygCostoGasto(fila.debe, fila.haber));
      current.officialGasto = round2(current.officialGasto + official);
    }
    byPeriod.set(periodo, current);
  }
  return [...byPeriod.values()]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((row) => ({
      ...row,
      ebitda: round2(row.ingreso - row.costo - row.gasto),
    }));
}

export function hasOfficialBudget(points: MonthlyPnlPoint[]): boolean {
  return points.some(
    (row) =>
      Math.abs(row.officialIngreso) > 0.01 ||
      Math.abs(row.officialCosto) > 0.01 ||
      Math.abs(row.officialGasto) > 0.01,
  );
}

export function buildPnlSeries(
  mockRows: MonthlyFinancials[],
  balanza?: BalanzaPnlLike[],
): SeriesBuildResult {
  const fromMock = fromMockFinancials(mockRows);
  const fromLedger = balanza && balanza.length > 0 ? fromBalanzaPnl(balanza) : [];
  const byPeriod = new Map(fromMock.map((row) => [row.periodo, row]));
  for (const row of fromLedger) {
    const prev = byPeriod.get(row.periodo);
    byPeriod.set(row.periodo, prev ? { ...prev, ...row, ebitda: round2(row.ingreso - row.costo - row.gasto) } : row);
  }
  const points = [...byPeriod.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  return { points, hasOfficialBudget: hasOfficialBudget(points) };
}

export function valuesOf(points: MonthlyPnlPoint[], key: "ingreso" | "costo" | "gasto"): number[] {
  return points.map((row) => row[key]);
}

export function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const [year, month] = periodo.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthIndex(periodo: string): number {
  const month = Number(periodo.split("-")[1]);
  return (month || 1) - 1;
}
