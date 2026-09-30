import { prisma } from "@/lib/prisma";
import {
  buildCogsDesglose,
  buildCogsVerticalAnalisis,
  sumVentasNetas,
  type CogsCuentaRow,
  type CogsDesglose,
  type CogsVerticalAnalisis,
} from "@/services/cogsDesglose";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { money } from "@/services/metricsLedger";

export type CogsDesglosePayload = CogsDesglose & {
  tenantId: string;
  periodo: string;
  periodoAnterior: string;
  hasBalanza: boolean;
  analisis: CogsVerticalAnalisis;
};

function previousMonth(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

function padPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function toCogsRows(
  rows: Array<{
    idCuenta: string;
    nombreCuenta: string;
    categoriaMaestra: string;
    debe: unknown;
    haber: unknown;
  }>,
): CogsCuentaRow[] {
  return rows.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    categoriaMaestra: row.categoriaMaestra,
    debe: money(row.debe),
    haber: money(row.haber),
  }));
}

export async function getCogsDesglose(
  tenantId: string,
  periodo: string,
): Promise<CogsDesglosePayload | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return null;
  }

  let target = parseIngresoPeriodo(periodo);
  if (!target) {
    const latest = await prisma.balanzaPnL.findFirst({
      where: { tenantId },
      orderBy: [{ anio: "desc" }, { periodo: "desc" }],
      select: { anio: true, periodo: true },
    });
    const now = new Date();
    target = latest
      ? { anio: latest.anio, mes: latest.periodo }
      : { anio: now.getUTCFullYear(), mes: now.getUTCMonth() + 1 };
  }

  const prior = previousMonth(target.anio, target.mes);
  const rows = await prisma.balanzaPnL.findMany({
    where: {
      tenantId,
      OR: [
        { anio: target.anio, periodo: { lte: target.mes } },
        ...(prior.anio !== target.anio ? [{ anio: prior.anio, periodo: prior.mes }] : []),
      ],
    },
    select: {
      idCuenta: true,
      nombreCuenta: true,
      categoriaMaestra: true,
      debe: true,
      haber: true,
      anio: true,
      periodo: true,
    },
  });

  const actualRaw = rows.filter((row) => row.anio === target.anio && row.periodo === target.mes);
  const priorRaw = rows.filter((row) => row.anio === prior.anio && row.periodo === prior.mes);
  const ytdRaw = rows.filter((row) => row.anio === target.anio && row.periodo <= target.mes);

  const actualRows = toCogsRows(actualRaw);
  const priorRows = toCogsRows(priorRaw);
  const ytdRows = toCogsRows(ytdRaw);

  const ventasActual = sumVentasNetas(actualRows);
  const ventasAnterior = sumVentasNetas(priorRows);
  const ventasAcumulado = sumVentasNetas(ytdRows);

  return {
    tenantId,
    periodo: padPeriodo(target.anio, target.mes),
    periodoAnterior: padPeriodo(prior.anio, prior.mes),
    hasBalanza: actualRaw.length > 0,
    ...buildCogsDesglose(actualRows, ventasActual),
    analisis: buildCogsVerticalAnalisis({
      acumulado: ytdRows,
      ventasAcumulado,
      mesActual: actualRows,
      ventasActual,
      mesAnterior: priorRows,
      ventasAnterior,
    }),
  };
}
