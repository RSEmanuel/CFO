import { prisma } from "@/lib/prisma";
import { getLedgerPeriods, type LedgerPeriodPayload } from "@/services/ledgerPeriodService";

export type DataCapabilities = {
  resultados: boolean;
  posicionFinanciera: boolean;
  flujo: boolean;
  cobranza: boolean;
  cxp: boolean;
  officialBudget: boolean;
  projection: boolean;
};

export type MissingInput = {
  module: keyof DataCapabilities;
  title: string;
  message: string;
};

export async function getDataCapabilities(
  tenantId: string,
  knownPeriods?: LedgerPeriodPayload,
): Promise<{
  capabilities: DataCapabilities;
  missingInputs: MissingInput[];
}> {
  const periods = knownPeriods ?? (await getLedgerPeriods(tenantId));
  const [balanza, tesoreria, ventas, egresos, budgetRows] = await Promise.all([
    prisma.balanzaPnL.count({ where: { tenantId } }),
    prisma.tesoreriaFlujo.count({ where: { tenantId } }),
    prisma.auxiliarVentas.count({ where: { tenantId } }),
    prisma.auxiliarEgresos.count({ where: { tenantId } }),
    prisma.balanzaPnL.count({
      where: { tenantId, montoPresupuestado: { not: 0 } },
    }),
  ]);
  const capabilities: DataCapabilities = {
    resultados: balanza > 0,
    posicionFinanciera: balanza > 0,
    flujo: tesoreria > 0,
    cobranza: ventas > 0,
    cxp: egresos > 0,
    officialBudget: budgetRows > 0,
    projection: periods.availablePeriods.length >= 8,
  };
  const definitions: Record<keyof DataCapabilities, [string, string]> = {
    resultados: ["Estado de resultados aún no disponible", "Carga una balanza de comprobación."],
    posicionFinanciera: ["Posición financiera aún no disponible", "Carga una balanza de comprobación."],
    flujo: [
      "Flujo de caja aún no disponible",
      "Para habilitarlo, carga un archivo de tesorería con entradas y salidas.",
    ],
    cobranza: ["Cobranza aún no disponible", "Para habilitarla, carga el auxiliar de clientes."],
    cxp: ["Cuentas por pagar aún no disponibles", "Para habilitarlas, carga el auxiliar de proveedores."],
    officialBudget: ["Presupuesto oficial aún no disponible", "Carga montos presupuestados por cuenta."],
    projection: ["Proyección estadística aún no disponible", "Se requieren al menos 8 periodos históricos."],
  };
  return {
    capabilities,
    missingInputs: (Object.keys(capabilities) as Array<keyof DataCapabilities>)
      .filter((key) => !capabilities[key])
      .map((key) => ({ module: key, title: definitions[key][0], message: definitions[key][1] })),
  };
}
