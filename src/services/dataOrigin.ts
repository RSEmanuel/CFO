import { prisma } from "@/lib/prisma";
import { periodKey } from "@/services/ledgerPeriodService";

export { resolvePeriodOrigins } from "@/services/periodOrigins";
export type { DataOrigin, PeriodOrigins } from "@/services/periodOrigins";

/**
 * Periodos con al menos un archivo COMMITTED en la auditoría de ingesta.
 * Cualquier periodo con datos en el ledger pero sin commit se trata como seed.
 */
export async function getCommittedIngestPeriods(tenantId: string): Promise<Set<string>> {
  const audits = await prisma.ingestFileAudit.findMany({
    where: { tenantId, status: "COMMITTED", periodo: { not: null }, anio: { not: null } },
    distinct: ["anio", "periodo"],
    select: { anio: true, periodo: true },
  });
  return new Set(
    audits
      .filter((row): row is { anio: number; periodo: number } => row.anio != null && row.periodo != null)
      .map((row) => periodKey(row.anio, row.periodo)),
  );
}
