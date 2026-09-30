import { prisma } from "@/lib/prisma";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import {
  buildIngresoMonitor,
  type IngresoCuentaRow,
  type IngresoMonitorModel,
} from "@/services/ingresoCalidad";
import { periodKey } from "@/services/ledgerPeriodService";
import { money } from "@/services/metricsLedger";

export type IngresoCalidadPayload = IngresoMonitorModel & {
  tenantId: string;
  periodo: string;
  hasBalanza: boolean;
};

function shiftMonth(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const date = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return { anio: date.getUTCFullYear(), mes: date.getUTCMonth() + 1 };
}

export async function getIngresoCalidad(
  tenantId: string,
  periodo: string,
): Promise<IngresoCalidadPayload | null> {
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

  const mesAnterior = shiftMonth(target.anio, target.mes, -1);
  const anoAnterior = shiftMonth(target.anio, target.mes, -12);

  const rows = await prisma.balanzaPnL.findMany({
    where: {
      tenantId,
      OR: [
        { anio: target.anio, periodo: target.mes },
        { anio: mesAnterior.anio, periodo: mesAnterior.mes },
        { anio: anoAnterior.anio, periodo: anoAnterior.mes },
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
      montoPresupuestado: true,
    },
  });

  const rowsFor = (anio: number, mes: number): IngresoCuentaRow[] =>
    rows
      .filter((row) => row.anio === anio && row.periodo === mes)
      .map((row) => ({
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        debe: money(row.debe),
        haber: money(row.haber),
      }));

  const actual = rowsFor(target.anio, target.mes);

  // Presupuesto oficial de ingreso del mes (misma fuente que el KPI
  // "Presupuesto oficial": montoPresupuestado de cuentas categoriaMaestra
  // = "Ingreso"). ~0 → sin presupuesto cargado.
  const presupuestoMes = rows
    .filter(
      (row) =>
        row.anio === target.anio && row.periodo === target.mes && row.categoriaMaestra === "Ingreso",
    )
    .reduce((sum, row) => sum + money(row.montoPresupuestado), 0);

  const model = buildIngresoMonitor({
    actual,
    mesAnterior: rowsFor(mesAnterior.anio, mesAnterior.mes),
    anoAnterior: rowsFor(anoAnterior.anio, anoAnterior.mes),
    anio: target.anio,
    mes: target.mes,
    hoy: new Date(),
    presupuesto: Math.abs(presupuestoMes) > 0.005 ? Math.round(presupuestoMes * 100) / 100 : null,
  });

  return {
    tenantId,
    periodo: periodKey(target.anio, target.mes),
    hasBalanza: actual.length > 0,
    ...model,
  };
}
