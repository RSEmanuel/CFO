import { prisma } from "@/lib/prisma";
import { cajaYRespiro, type CajaYRespiro } from "@/services/caja";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { resolveAccountRoles } from "@/services/ingresoMixService";

export type CajaPayload = CajaYRespiro & {
  tenantId: string;
  periodo: string;
  hasBalanza: boolean;
};

/** Tu caja y meses de respiro del mes, con la definición única de services/caja.ts. */
export async function getCajaRespiro(tenantId: string, periodo: string): Promise<CajaPayload | null> {
  const target = parseIngresoPeriodo(periodo);
  if (!target) {
    return null;
  }
  const [rows, roles] = await Promise.all([
    prisma.balanzaPnL.findMany({
      where: { tenantId, anio: target.anio, periodo: { lte: target.mes } },
      select: {
        idCuenta: true,
        nombreCuenta: true,
        categoriaMaestra: true,
        saldoFinal: true,
        debe: true,
        haber: true,
        periodo: true,
      },
    }),
    resolveAccountRoles(tenantId),
  ]);
  const balanzaCierre = rows.filter((row) => row.periodo === target.mes);
  return {
    tenantId,
    periodo,
    hasBalanza: balanzaCierre.length > 0,
    ...cajaYRespiro({ periodo: target.mes, balanzaCierre, balanzaHistorial: rows, roles }),
  };
}
