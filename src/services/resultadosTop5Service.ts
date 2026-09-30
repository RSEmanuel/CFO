import { prisma } from "@/lib/prisma";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { periodKey } from "@/services/ledgerPeriodService";
import { money } from "@/services/metricsLedger";
import {
  alignTop5Series,
  buildTop5Clientes,
  buildTop5Lineas,
  totalAuxiliarMes,
  TOP5_WINDOW_MONTHS,
  trailingMonths,
  type AuxiliarClienteRow,
  type BalanzaLineaRow,
  type MonthPoint,
  type ResultadosTop5Payload,
} from "@/services/resultadosTop5";

export type { ResultadosTop5Payload };

async function latestBalanzaPeriod(tenantId: string): Promise<{ anio: number; mes: number } | null> {
  const latest = await prisma.balanzaPnL.findFirst({
    where: { tenantId },
    orderBy: [{ anio: "desc" }, { periodo: "desc" }],
    select: { anio: true, periodo: true },
  });
  return latest ? { anio: latest.anio, mes: latest.periodo } : null;
}

function windowOr(months: MonthPoint[]) {
  return months.map((month) => ({ anio: month.anio, periodo: month.mes }));
}

function rowsForMonth(
  rows: Array<AuxiliarClienteRow & { anio: number; periodo: number }>,
  month: MonthPoint,
): AuxiliarClienteRow[] {
  return rows
    .filter((row) => row.anio === month.anio && row.periodo === month.mes)
    .map(({ idCuenta, nombreCuenta, cargos }) => ({ idCuenta, nombreCuenta, cargos }));
}

// Clientes por mes: auxiliar_cuenta_resumen si el mes tiene filas; si no,
// auxiliar_movimientos agregado. Meses sin auxiliar quedan en [].
async function loadClienteRowsWindow(
  tenantId: string,
  months: MonthPoint[],
  moneda: string,
): Promise<{
  byMonth: AuxiliarClienteRow[][];
  fuenteActivo: "resumen" | "movimientos" | null;
}> {
  const or = windowOr(months);
  const [resumen, movimientos] = await Promise.all([
    prisma.auxiliarCuentaResumen.findMany({
      where: { tenantId, moneda, OR: or },
      select: { idCuenta: true, nombreCuenta: true, cargos: true, anio: true, periodo: true },
    }),
    prisma.auxiliarMovimiento.groupBy({
      by: ["anio", "periodo", "idCuenta", "nombreCuenta"],
      where: { tenantId, moneda, OR: or },
      _sum: { cargos: true },
    }),
  ]);

  const resumenRows = resumen.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    cargos: money(row.cargos),
    anio: row.anio,
    periodo: row.periodo,
  }));
  const movimientoRows = movimientos.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    cargos: money(row._sum.cargos ?? 0),
    anio: row.anio,
    periodo: row.periodo,
  }));
  const resumenMonths = new Set(resumenRows.map((row) => periodKey(row.anio, row.periodo)));
  const movimientoMonths = new Set(movimientoRows.map((row) => periodKey(row.anio, row.periodo)));

  const byMonth = months.map((month) => {
    if (resumenMonths.has(month.key)) {
      return rowsForMonth(resumenRows, month);
    }
    if (movimientoMonths.has(month.key)) {
      return rowsForMonth(movimientoRows, month);
    }
    return [];
  });

  const activo = months[months.length - 1];
  const fuenteActivo = activo
    ? resumenMonths.has(activo.key)
      ? "resumen"
      : movimientoMonths.has(activo.key)
        ? "movimientos"
        : null
    : null;

  return { byMonth, fuenteActivo };
}

export async function getResultadosTop5(
  tenantId: string,
  periodo: string,
  moneda: string,
): Promise<ResultadosTop5Payload | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return null;
  }

  let target = parseIngresoPeriodo(periodo);
  if (!target) {
    const latest = await latestBalanzaPeriod(tenantId);
    const now = new Date();
    target = latest
      ? { anio: latest.anio, mes: latest.mes }
      : { anio: now.getUTCFullYear(), mes: now.getUTCMonth() + 1 };
  }
  const monedaNorm = (moneda || "MXN").toUpperCase();
  const months = trailingMonths(target.anio, target.mes, TOP5_WINDOW_MONTHS);

  const [roles, balanzaRows, clientesAux] = await Promise.all([
    resolveAccountRoles(tenantId),
    prisma.balanzaPnL.findMany({
      where: { tenantId, OR: windowOr(months) },
      select: {
        idCuenta: true,
        nombreCuenta: true,
        categoriaMaestra: true,
        debe: true,
        haber: true,
        anio: true,
        periodo: true,
      },
    }),
    loadClienteRowsWindow(tenantId, months, monedaNorm),
  ]);

  const lineaRows = (anio: number, mes: number): BalanzaLineaRow[] =>
    balanzaRows
      .filter((row) => row.anio === anio && row.periodo === mes)
      .map((row) => ({
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        categoriaMaestra: row.categoriaMaestra,
        debe: money(row.debe),
        haber: money(row.haber),
      }));

  // Universos de participación (independientes del KPI de ingreso del P&L):
  // - Clientes: Σ cargos de hojas de cliente del auxiliar del mes.
  // - Líneas: Σ (haber − debe) de hojas 4xx (rol ingresos). Excluye 7xx.
  const clientesBloques = months.map((_, index) =>
    buildTop5Clientes(clientesAux.byMonth[index] ?? [], roles),
  );
  const lineasBloques = months.map((month) => buildTop5Lineas(lineaRows(month.anio, month.mes), roles));
  const clientesPorMes = clientesBloques.map((bloque) => bloque.grupos);
  const lineasPorMes = lineasBloques.map((bloque) => bloque.grupos);
  const totalAuxiliarClientes = clientesBloques.map((bloque) => totalAuxiliarMes(bloque.grupos));
  const totalAuxiliarLineas = lineasBloques.map((bloque) => totalAuxiliarMes(bloque.grupos));

  const activoLineas = lineaRows(target.anio, target.mes);
  const clientes = clientesBloques[clientesBloques.length - 1] ?? { grupos: [], total: 0 };
  const lineas = lineasBloques[lineasBloques.length - 1] ?? { grupos: [], total: 0 };

  return {
    tenantId,
    periodo: periodKey(target.anio, target.mes),
    moneda: monedaNorm,
    clientes,
    lineas,
    clientesSeries: alignTop5Series(months, totalAuxiliarClientes, clientesPorMes, clientes.grupos, 5),
    lineasSeries: alignTop5Series(months, totalAuxiliarLineas, lineasPorMes, lineas.grupos, 5),
    hasBalanza: activoLineas.length > 0,
    fuenteClientes: clientesAux.fuenteActivo,
  };
}
