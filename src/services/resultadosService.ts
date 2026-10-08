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

/**
 * El estado de resultados solo suma Ingreso, COGS y OpEx (lo demás lo descarta
 * `buildResultadosSeries`), y solo lee estas columnas. Pedir únicamente eso a la
 * base da las mismas cifras que leer toda la tabla.
 */
export const RESULTADOS_CATEGORIAS = ["Ingreso", "COGS", "OpEx"] as const;
export const RESULTADOS_ROW_SELECT = {
  anio: true,
  periodo: true,
  idCuenta: true,
  nombreCuenta: true,
  categoriaMaestra: true,
  debe: true,
  haber: true,
  depreciacionAmortizacion: true,
} as const;

export async function getResultados(tenantId: string): Promise<ResultadosPayload> {
  const periods = await getLedgerPeriods(tenantId);
  const [rows, anyRow, availability, committedPeriods] = await Promise.all([
    prisma.balanzaPnL.findMany({
      where: { tenantId, categoriaMaestra: { in: [...RESULTADOS_CATEGORIAS] } },
      select: RESULTADOS_ROW_SELECT,
      orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idCuenta: "asc" }],
    }),
    prisma.balanzaPnL.findFirst({ where: { tenantId }, select: { id: true } }),
    getDataCapabilities(tenantId, periods),
    getCommittedIngestPeriods(tenantId),
  ]);
  const built = buildResultadosSeries(rows);
  return {
    tenantId,
    hasData: anyRow != null,
    availablePeriods: periods.availablePeriods,
    latestPeriod: periods.latestPeriod,
    ...built,
    ...availability,
    periodOrigins: resolvePeriodOrigins(periods.availablePeriods, committedPeriods),
  };
}
