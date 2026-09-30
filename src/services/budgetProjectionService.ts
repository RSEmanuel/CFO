import { prisma, requireBudgetAssumptionDelegate } from "@/lib/prisma";
import { projectFromPoints } from "@/services/forecast/budgetProjection";
import { applyBudgetDrivers, type BudgetDrivers } from "@/services/forecast/drivers";
import { fromBalanzaPnl } from "@/services/forecast/series";
import type {
  BudgetProjectionResult,
  MonthlyPnlPoint,
} from "@/services/forecast/types";
import { round2, toNumber } from "@/services/money";

export type OfficialBudgetMonth = {
  periodo: string;
  ingreso: number;
  costo: number;
  gasto: number;
  ebitda: number;
};

export type BudgetProjectionPayload = {
  tenantId: string;
  anchorPeriodo: string;
  projection: BudgetProjectionResult;
  history: MonthlyPnlPoint[];
  official: OfficialBudgetMonth[];
  source: "ledger";
  sourceMonths: number;
  hasOfficialBudget: boolean;
  status: "available" | "insufficient_history";
  drivers: BudgetDrivers | null;
};

function periodKey(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

function officialByMonth(
  rows: Array<{
    anio: number;
    periodo: number;
    categoriaMaestra: string;
    montoPresupuestado: unknown;
  }>,
): OfficialBudgetMonth[] {
  const grouped = new Map<string, OfficialBudgetMonth>();
  for (const row of rows) {
    const key = periodKey(row.anio, row.periodo);
    const current = grouped.get(key) ?? {
      periodo: key,
      ingreso: 0,
      costo: 0,
      gasto: 0,
      ebitda: 0,
    };
    const raw = toNumber(row.montoPresupuestado as number);
    const amount = Number.isFinite(raw) ? raw : 0;
    if (row.categoriaMaestra === "Ingreso") {
      current.ingreso = round2(current.ingreso + amount);
    } else if (row.categoriaMaestra === "COGS") {
      current.costo = round2(current.costo + amount);
    } else if (row.categoriaMaestra === "OpEx") {
      current.gasto = round2(current.gasto + amount);
    }
    current.ebitda = round2(current.ingreso - current.costo - current.gasto);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .filter(
      (row) =>
        Math.abs(row.ingreso) > 0.01 ||
        Math.abs(row.costo) > 0.01 ||
        Math.abs(row.gasto) > 0.01,
    )
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export async function getBudgetProjection(
  tenantId: string,
  anchorPeriodo: string,
): Promise<BudgetProjectionPayload> {
  const anchorYear = Number(anchorPeriodo.slice(0, 4));
  requireBudgetAssumptionDelegate();
  const [ledgerRows, assumptionRow] = await Promise.all([
    prisma.balanzaPnL.findMany({
      where: { tenantId },
      orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idCuenta: "asc" }],
    }),
    prisma.budgetAssumption.findUnique({
      where: { tenantId_anio: { tenantId, anio: anchorYear } },
    }),
  ]);

  const historyRows = ledgerRows.filter(
    (row) => periodKey(row.anio, row.periodo) <= anchorPeriodo,
  );
  const ledgerHistory = fromBalanzaPnl(historyRows);
  const history = ledgerHistory;
  const official = officialByMonth(ledgerRows);
  const hasOfficialBudget = official.length > 0;
  const baseProjection = projectFromPoints(
    history,
    undefined,
    hasOfficialBudget,
    anchorPeriodo,
  );

  const drivers: BudgetDrivers | null = assumptionRow
    ? {
        salesGrowthPct: toNumber(assumptionRow.salesGrowthPct),
        inflationPct: toNumber(assumptionRow.inflationPct),
        headcount: assumptionRow.headcount,
        headcountCostMonthly: toNumber(assumptionRow.headcountCostMonthly),
        debtInterestMonthly: toNumber(assumptionRow.debtInterestMonthly),
        depreciationMonthly: toNumber(assumptionRow.depreciationMonthly),
      }
    : null;
  const projection = drivers ? applyBudgetDrivers(baseProjection, drivers) : baseProjection;

  return {
    tenantId,
    anchorPeriodo,
    projection,
    history,
    official,
    source: "ledger",
    sourceMonths: history.length,
    hasOfficialBudget,
    status: history.length >= 8 ? "available" : "insufficient_history",
    drivers,
  };
}
