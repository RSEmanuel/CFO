import { prisma } from "@/lib/prisma";
import { buildFlujoLibre, type FlujoLibreModel, type FlujoLibreSaldo } from "@/services/flujoLibre";
import type { ErCuentaRow } from "@/services/estadoOperativo";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { money } from "@/services/metricsLedger";

export type FlujoLibrePayload = FlujoLibreModel & {
  tenantId: string;
  periodo: string;
  periodoAnterior: string;
};

function previousMonth(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

function padPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export async function getFlujoLibre(tenantId: string, periodo: string): Promise<FlujoLibrePayload | null> {
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
  const [rows, roles] = await Promise.all([
    prisma.balanzaPnL.findMany({
      where: {
        tenantId,
        OR: [
          { anio: target.anio, periodo: target.mes },
          { anio: prior.anio, periodo: prior.mes },
        ],
      },
      select: {
        idCuenta: true,
        nombreCuenta: true,
        debe: true,
        haber: true,
        saldoFinal: true,
        anio: true,
        periodo: true,
      },
    }),
    resolveAccountRoles(tenantId),
  ]);

  const actual = rows.filter((row) => row.anio === target.anio && row.periodo === target.mes);
  const anterior = rows.filter((row) => row.anio === prior.anio && row.periodo === prior.mes);
  const mesActual: ErCuentaRow[] = actual.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    debe: money(row.debe),
    haber: money(row.haber),
  }));
  const toSaldo = (row: (typeof rows)[number]): FlujoLibreSaldo => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    saldoFinal: money(row.saldoFinal),
  });

  return {
    tenantId,
    periodo: padPeriodo(target.anio, target.mes),
    periodoAnterior: padPeriodo(prior.anio, prior.mes),
    ...buildFlujoLibre({
      mesActual,
      saldosActual: actual.map(toSaldo),
      saldosAnterior: anterior.map(toSaldo),
      roles,
    }),
  };
}
