import { prisma } from "@/lib/prisma";

export type LedgerPeriodPayload = {
  tenantId: string;
  hasData: boolean;
  availablePeriods: string[];
  latestPeriod: string | null;
};

export function periodKey(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

export async function getLedgerPeriods(tenantId: string): Promise<LedgerPeriodPayload> {
  const rows = await prisma.balanzaPnL.findMany({
    where: { tenantId },
    distinct: ["anio", "periodo"],
    select: { anio: true, periodo: true },
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  const availablePeriods = rows.map((row) => periodKey(row.anio, row.periodo));
  return {
    tenantId,
    hasData: availablePeriods.length > 0,
    availablePeriods,
    latestPeriod: availablePeriods.at(-1) ?? null,
  };
}
