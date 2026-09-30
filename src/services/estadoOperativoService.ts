import { prisma } from "@/lib/prisma";
import {
  buildEstadoOperativo,
  type ErCuentaRow,
  type EstadoOperativo,
} from "@/services/estadoOperativo";
import { buildEbitdaTtm, type EbitdaTtmPoint } from "@/services/estadoOperativoTtm";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { money } from "@/services/metricsLedger";

export type EstadoOperativoPayload = EstadoOperativo & {
  tenantId: string;
  periodo: string;
  periodoAnterior: string;
  hasBalanza: boolean;
  /** Serie TTM (12m) EBIT vs EBITDA con buckets canónicos del ER. */
  ttm: EbitdaTtmPoint[];
};

function previousMonth(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

function padPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function toErRows(
  rows: Array<{
    idCuenta: string;
    nombreCuenta: string;
    debe: unknown;
    haber: unknown;
  }>,
): ErCuentaRow[] {
  return rows.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    debe: money(row.debe),
    haber: money(row.haber),
  }));
}

export async function getEstadoOperativo(
  tenantId: string,
  periodo: string,
): Promise<EstadoOperativoPayload | null> {
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
  // La serie TTM necesita 12 meses hacia atrás; si cruza de año hay que
  // incluir la cola del año anterior (p.ej. ago–dic 2025 para jul-2026).
  const ttmStart = (() => {
    let mes = target.mes - 11;
    let anio = target.anio;
    if (mes <= 0) {
      mes += 12;
      anio -= 1;
    }
    return { anio, mes };
  })();
  const rows = await prisma.balanzaPnL.findMany({
    where: {
      tenantId,
      OR: [
        { anio: target.anio, periodo: { lte: target.mes } },
        ...(ttmStart.anio !== target.anio
          ? [{ anio: ttmStart.anio, periodo: { gte: ttmStart.mes } }]
          : []),
      ],
    },
    select: {
      idCuenta: true,
      nombreCuenta: true,
      debe: true,
      haber: true,
      anio: true,
      periodo: true,
    },
  });

  const actualRows = toErRows(rows.filter((row) => row.anio === target.anio && row.periodo === target.mes));
  const priorRows = toErRows(rows.filter((row) => row.anio === prior.anio && row.periodo === prior.mes));
  const ytdRows = toErRows(rows.filter((row) => row.anio === target.anio && row.periodo <= target.mes));
  const ttm = buildEbitdaTtm(
    rows.map((row) => ({
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      debe: money(row.debe),
      haber: money(row.haber),
      anio: row.anio,
      periodo: row.periodo,
    })),
    target,
  );

  return {
    tenantId,
    periodo: padPeriodo(target.anio, target.mes),
    periodoAnterior: padPeriodo(prior.anio, prior.mes),
    hasBalanza: actualRows.length > 0,
    ttm,
    ...buildEstadoOperativo({
      acumulado: ytdRows,
      mesActual: actualRows,
      mesAnterior: priorRows,
    }),
  };
}
