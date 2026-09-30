import { prisma } from "@/lib/prisma";
import { computeErBuckets } from "@/services/estadoOperativo";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { money } from "@/services/metricsLedger";
import {
  classifyPuenteCuenta,
  computeImpuestosMonitor,
  computeRifDesglose,
  evaluarCuentasPuente,
  type ImpuestosMonitor,
  type PeriodoRef,
  type PuenteClaseEstado,
  type RifBalanzaRow,
  type RifDesglose,
} from "@/services/rifAuditoria";

export type RifAuditoriaPayload = {
  tenantId: string;
  periodo: string;
  periodoAnterior: string;
  hasBalanza: boolean;
  rif: RifDesglose;
  impuestos: ImpuestosMonitor;
  cuentasPuente: PuenteClaseEstado[];
};

const SERIE_MESES = 12;

function previousMonth(anio: number, mes: number): PeriodoRef {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

function padPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function toRifRows(
  rows: Array<{
    idCuenta: string;
    nombreCuenta: string;
    debe: unknown;
    haber: unknown;
    saldoFinal: unknown;
    anio: number;
    periodo: number;
  }>,
): RifBalanzaRow[] {
  return rows.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    debe: money(row.debe),
    haber: money(row.haber),
    saldoFinal: money(row.saldoFinal),
    anio: row.anio,
    periodo: row.periodo,
  }));
}

/**
 * Compone las tres secciones del tab RIF & Auditoría: desglose del RIF por
 * subcuenta (cuadra con el ER canónico), monitor de impuestos (PTU/ISR +
 * tasa efectiva) y semáforo de cuentas puente con antigüedad de auxiliares.
 */
export async function getRifAuditoria(
  tenantId: string,
  target: PeriodoRef | null,
): Promise<RifAuditoriaPayload | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return null;
  }

  let resolved = target;
  if (!resolved) {
    const latest = await prisma.balanzaPnL.findFirst({
      where: { tenantId },
      orderBy: [{ anio: "desc" }, { periodo: "desc" }],
      select: { anio: true, periodo: true },
    });
    const now = new Date();
    resolved = latest
      ? { anio: latest.anio, mes: latest.periodo }
      : { anio: now.getUTCFullYear(), mes: now.getUTCMonth() + 1 };
  }

  const prior = previousMonth(resolved.anio, resolved.mes);

  // La serie de los últimos 12 periodos con balanza cubre a la vez el YTD del
  // año objetivo, el mes anterior y el histórico del gráfico: una sola ida a DB.
  const periodosDesc = await prisma.balanzaPnL.findMany({
    where: {
      tenantId,
      OR: [{ anio: { lt: resolved.anio } }, { anio: resolved.anio, periodo: { lte: resolved.mes } }],
    },
    select: { anio: true, periodo: true },
    distinct: ["anio", "periodo"],
    orderBy: [{ anio: "desc" }, { periodo: "desc" }],
    take: SERIE_MESES,
  });
  const seriePeriodos: PeriodoRef[] = periodosDesc
    .map((row) => ({ anio: row.anio, mes: row.periodo }))
    .reverse();

  const rawRows = seriePeriodos.length
    ? await prisma.balanzaPnL.findMany({
        where: {
          tenantId,
          OR: seriePeriodos.map((p) => ({ anio: p.anio, periodo: p.mes })),
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
      })
    : [];
  const rows = toRifRows(rawRows);

  const rif = computeRifDesglose({ rows, target: resolved, prior, seriePeriodos });

  const erRows = (scope: (row: RifBalanzaRow) => boolean) =>
    rows.filter(scope).map((row) => ({
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      debe: row.debe,
      haber: row.haber,
    }));
  const bucketsMes = computeErBuckets(
    erRows((row) => row.anio === resolved.anio && row.periodo === resolved.mes),
  );
  const bucketsYtd = computeErBuckets(
    erRows((row) => row.anio === resolved.anio && row.periodo <= resolved.mes),
  );
  const impuestos = computeImpuestosMonitor(bucketsMes, bucketsYtd);

  // Antigüedad: último movimiento de auxiliares por cuenta puente hoja.
  const leafSet = selectLeafCodes([...new Set(rows.map((row) => row.idCuenta))]);
  const puenteCodes = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.anio === resolved.anio &&
            row.periodo === resolved.mes &&
            leafSet.has(row.idCuenta) &&
            classifyPuenteCuenta(row.idCuenta, row.nombreCuenta) != null,
        )
        .map((row) => row.idCuenta),
    ),
  ];
  const auxRows = puenteCodes.length
    ? await prisma.auxiliarMovimiento.groupBy({
        by: ["idCuenta"],
        where: { tenantId, idCuenta: { in: puenteCodes } },
        _max: { fecha: true },
      })
    : [];
  const auxUltimoMov: Record<string, string> = {};
  for (const row of auxRows) {
    if (row._max.fecha) {
      auxUltimoMov[row.idCuenta] = row._max.fecha.toISOString();
    }
  }

  const cuentasPuente = evaluarCuentasPuente({ rows, target: resolved, prior, auxUltimoMov });

  return {
    tenantId,
    periodo: padPeriodo(resolved.anio, resolved.mes),
    periodoAnterior: padPeriodo(prior.anio, prior.mes),
    hasBalanza: rows.some((row) => row.anio === resolved.anio && row.periodo === resolved.mes),
    rif,
    impuestos,
    cuentasPuente,
  };
}
