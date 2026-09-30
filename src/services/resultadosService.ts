import { prisma } from "@/lib/prisma";
import { getDataCapabilities, type DataCapabilities, type MissingInput } from "@/services/dataCapabilities";
import {
  getCommittedIngestPeriods,
  resolvePeriodOrigins,
  type PeriodOrigins,
} from "@/services/dataOrigin";
import { getLedgerPeriods } from "@/services/ledgerPeriodService";
import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import {
  buildResultadosSeries,
  type ResultadosAccountBreakdown,
} from "@/services/resultadosLedger";

export type ResultadosPayload = {
  tenantId: string;
  hasData: boolean;
  availablePeriods: string[];
  latestPeriod: string | null;
  series: MonthlyFinancials[];
  breakdown: ResultadosAccountBreakdown[];
  capabilities: DataCapabilities;
  missingInputs: MissingInput[];
  periodOrigins: PeriodOrigins;
};

export async function getResultados(tenantId: string): Promise<ResultadosPayload> {
  const periods = await getLedgerPeriods(tenantId);
  const [rows, availability, committedPeriods] = await Promise.all([
    prisma.balanzaPnL.findMany({
      where: { tenantId },
      orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idCuenta: "asc" }],
    }),
    getDataCapabilities(tenantId, periods),
    getCommittedIngestPeriods(tenantId),
  ]);
  const built = buildResultadosSeries(rows);
  return {
    tenantId,
    hasData: rows.length > 0,
    availablePeriods: periods.availablePeriods,
    latestPeriod: periods.latestPeriod,
    ...built,
    ...availability,
    periodOrigins: resolvePeriodOrigins(periods.availablePeriods, committedPeriods),
  };
}
