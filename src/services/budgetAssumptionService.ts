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
    drivers: {
      salesGrowthPct: toNumber(row.salesGrowthPct),
      inflationPct: toNumber(row.inflationPct),
      headcount: row.headcount,
      headcountCostMonthly: toNumber(row.headcountCostMonthly),
      debtInterestMonthly: toNumber(row.debtInterestMonthly),
      depreciationMonthly: toNumber(row.depreciationMonthly),
    },
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
