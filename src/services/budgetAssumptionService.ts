import { prisma, requireBudgetAssumptionDelegate } from "@/lib/prisma";
import { DEFAULT_BUDGET_DRIVERS, type BudgetDrivers } from "@/services/forecast/drivers";
import { toNumber } from "@/services/money";

export type BudgetAssumptionPayload = {
  tenantId: string;
  anio: number;
  drivers: BudgetDrivers;
  persisted: boolean;
  updatedAt: string | null;
};

type BudgetAssumptionRow = {
  salesGrowthPct: unknown;
  inflationPct: unknown;
  headcount: number;
  headcountCostMonthly: unknown;
  debtInterestMonthly: unknown;
  depreciationMonthly: unknown;
};

export function rowToBudgetDrivers(row: BudgetAssumptionRow): BudgetDrivers {
  return {
    salesGrowthPct: toNumber(row.salesGrowthPct as number),
    inflationPct: toNumber(row.inflationPct as number),
    headcount: row.headcount,
    headcountCostMonthly: toNumber(row.headcountCostMonthly as number),
    debtInterestMonthly: toNumber(row.debtInterestMonthly as number),
    depreciationMonthly: toNumber(row.depreciationMonthly as number),
  };
}

export async function getBudgetAssumptions(
  tenantId: string,
  anio: number,
): Promise<BudgetAssumptionPayload> {
  requireBudgetAssumptionDelegate();
  const row = await prisma.budgetAssumption.findUnique({
    where: { tenantId_anio: { tenantId, anio } },
  });
  if (!row) {
    return {
      tenantId,
      anio,
      drivers: { ...DEFAULT_BUDGET_DRIVERS },
      persisted: false,
      updatedAt: null,
    };
  }
  return {
    tenantId,
    anio,
    drivers: rowToBudgetDrivers(row),
    persisted: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertBudgetAssumptions(
  tenantId: string,
  anio: number,
  drivers: BudgetDrivers,
): Promise<BudgetAssumptionPayload> {
  requireBudgetAssumptionDelegate();
  const row = await prisma.budgetAssumption.upsert({
    where: { tenantId_anio: { tenantId, anio } },
    create: { tenantId, anio, ...drivers },
    update: { ...drivers },
  });
  return {
    tenantId,
    anio,
    drivers,
    persisted: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** "Volver a la proyección automática": borra los supuestos guardados de ese año. */
export async function deleteBudgetAssumptions(tenantId: string, anio: number): Promise<{ deleted: boolean }> {
  requireBudgetAssumptionDelegate();
  const result = await prisma.budgetAssumption.deleteMany({ where: { tenantId, anio } });
  return { deleted: result.count > 0 };
}
