import { prisma } from "@/lib/prisma";
import {
  buildGastoOpexGrupos,
  buildGastoOpexSeries,
  computeGastoOpexControl,
  detectGastoOpexAlertas,
  rankingGastoOpex,
  type GastoOpexAlerta,
  type GastoOpexControl,
} from "@/services/gastoOpex";
import { buildGastoOpexTreemap, type GastoOpexTreemap } from "@/services/gastoOpexTreemap";
import { parseIngresoPeriodo } from "@/services/ingresoMix";
import { periodKey } from "@/services/ledgerPeriodService";
import { money } from "@/services/metricsLedger";
import { trailingMonths, type MonthPoint, type Top5ChartSeries, type Top5Grupo } from "@/services/resultadosTop5";

export type GastoOpexPayload = {
  tenantId: string;
  periodo: string;
  hasBalanza: boolean;
  totalOpex: number;
  series: Top5ChartSeries;
  ranking: Top5Grupo[];
  totalesPorMes: Record<string, number>;
  control: GastoOpexControl;
  /** Alertas vs. promedio 3M; se calculan sobre la ventana 24m ya cargada (sin query extra). */
  alertas: GastoOpexAlerta[];
  /** Árbol del treemap del mes activo (buckets canónicos → hojas); reutiliza las filas ya cargadas. */
  treemap: GastoOpexTreemap;
};

function windowOr(months: MonthPoint[]) {
  return months.map((month) => ({ anio: month.anio, periodo: month.mes }));
}

export async function getGastoOpex(tenantId: string, periodo: string): Promise<GastoOpexPayload | null> {
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

  const kpiMonths = trailingMonths(target.anio, target.mes, 24);
  const chartMonths = kpiMonths.slice(-12);
  const rows = await prisma.balanzaPnL.findMany({
    where: { tenantId, OR: windowOr(kpiMonths) },
    select: {
      idCuenta: true,
      nombreCuenta: true,
      debe: true,
      haber: true,
      anio: true,
      periodo: true,
    },
  });

  const rowsFor = (anio: number, mes: number) =>
    rows
      .filter((row) => row.anio === anio && row.periodo === mes)
      .map((row) => ({
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        debe: money(row.debe),
        haber: money(row.haber),
      }));

  const totalesPorMes: Record<string, number> = {};
  for (const month of kpiMonths) {
    const monthRows = rowsFor(month.anio, month.mes);
    if (monthRows.length === 0) {
      continue;
    }
    const { totalOpex } = buildGastoOpexGrupos(monthRows);
    totalesPorMes[month.key] = totalOpex;
  }

  const gruposPorMes = chartMonths.map((month) => buildGastoOpexGrupos(rowsFor(month.anio, month.mes)).grupos);
  const activo = rowsFor(target.anio, target.mes);
  const { grupos, totalOpex } = buildGastoOpexGrupos(activo);
  const ranking = rankingGastoOpex(grupos, 5);
  const totales = chartMonths.map((month) => totalesPorMes[month.key] ?? 0);
  const series = buildGastoOpexSeries(chartMonths, gruposPorMes, totales, ranking, 5);

  let prior: MonthPoint | null = null;
  for (let index = kpiMonths.length - 2; index >= 0; index -= 1) {
    const candidate = kpiMonths[index];
    if (rowsFor(candidate.anio, candidate.mes).length > 0) {
      prior = candidate;
      break;
    }
  }
  const control = computeGastoOpexControl(
    activo,
    prior ? rowsFor(prior.anio, prior.mes) : null,
    prior ? prior.key : null,
  );

  const treemap = buildGastoOpexTreemap(
    activo,
    prior ? rowsFor(prior.anio, prior.mes) : null,
    prior ? prior.key : null,
  );

  const priorWindow = trailingMonths(target.anio, target.mes, 4).slice(0, 3);
  const alertas = detectGastoOpexAlertas(
    activo,
    priorWindow.map((month) => rowsFor(month.anio, month.mes)),
  );

  return {
    tenantId,
    periodo: periodKey(target.anio, target.mes),
    hasBalanza: activo.length > 0,
    totalOpex,
    series,
    ranking,
    totalesPorMes,
    control,
    alertas,
    treemap,
  };
}
