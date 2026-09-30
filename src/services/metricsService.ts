import { AppError } from "@/auth/errors";
import { prisma } from "@/lib/prisma";
import { previousPeriod } from "@/lib/session-types";
import { cccFromBalanza } from "@/services/capitalTrabajoCalcs";
import { CATALOG_ASSUMPTIONS, buildPeriodSnapshot } from "@/services/financialSnapshot";
import type { AccountRoles } from "@/services/ingest/types";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { getAllMetrics, type CatalogCategories } from "@/services/financialEngine";
import { endOfPeriod } from "@/services/financialValidations";
import { formatMxn, round2 } from "@/services/money";
import {
  DASHBOARD_ASSUMPTIONS,
  inCalendarPeriod,
  inYtd,
  money,
  pnlFromBalanza,
  ratioPct,
  structureFromBalanza,
  treasuryFromRows,
} from "@/services/metricsLedger";
import { buildCapitalTrabajo } from "@/services/modules/capitalTrabajo";
import { buildFlujoCaja } from "@/services/modules/flujoCaja";
import { buildPnlDetallado } from "@/services/modules/pnlDetallado";
import { buildSaludFinanciera } from "@/services/modules/saludFinanciera";
import { buildUnitEconomics } from "@/services/modules/unitEconomics";
import type { DashboardView, FullDashboard, ModulePack } from "@/services/metricsTypes";
import type { AuxiliarEgresos, AuxiliarVentas, BalanzaPnL, TesoreriaFlujo } from "@/generated/prisma/client";

export type HeroMetrics = {
  tenantId: string;
  periodo: number;
  anio: number;
  freeCashFlow: number;
  freeCashFlowFormatted: string;
  cashRunwayDays: number | null;
  ebitdaMarginPct: number | null;
  ebit: number;
  ebitFormatted: string;
  da: number;
  daFormatted: string;
  ccc: {
    dso: number;
    dio: number;
    dpo: number;
    days: number;
  };
  realVsBudget: {
    ingresosPct: number | null;
    gastosPct: number | null;
    ingresosReal: number;
    ingresosBudget: number;
    gastosReal: number;
    gastosBudget: number;
    ingresosRealFormatted: string;
    ingresosBudgetFormatted: string;
    gastosRealFormatted: string;
    gastosBudgetFormatted: string;
  };
  customerConcentration: {
    top5Pct: number;
    top5: Array<{
      idCliente: string;
      nombreCliente: string;
      facturacion: number;
      facturacionFormatted: string;
      pct: number;
    }>;
  };
};

export type { FullDashboard } from "@/services/metricsTypes";

function assertPeriod(periodo: number, anio: number): void {
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 12) {
    throw new AppError("VALIDATION_ERROR", "El periodo debe ser un entero entre 1 y 12.", 400);
  }
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new AppError("VALIDATION_ERROR", "El año debe ser un entero válido.", 400);
  }
}

export async function loadPeriodData(tenantId: string, periodo: number, anio: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  const finPeriodo = endOfPeriod(anio, periodo);
  const inicioPeriodo = new Date(anio, periodo - 1, 1);

  const [balanzaYtd, tesoreriaYtd, ventasHastaPeriodo, egresosHastaPeriodo] = await Promise.all([
    prisma.balanzaPnL.findMany({ where: { tenantId, anio, periodo: { lte: periodo } } }),
    prisma.tesoreriaFlujo.findMany({ where: { tenantId, anio, periodo: { lte: periodo } } }),
    prisma.auxiliarVentas.findMany({
      where: { tenantId, fechaEmision: { lte: finPeriodo } },
    }),
    prisma.auxiliarEgresos.findMany({
      where: { tenantId, fechaEmision: { lte: finPeriodo } },
    }),
  ]);

  const balanzaMes = balanzaYtd.filter((fila) => fila.periodo === periodo);
  const tesoreriaMes = tesoreriaYtd.filter((fila) => fila.periodo === periodo);

  if (balanzaMes.length === 0 && tesoreriaMes.length === 0) {
    throw new AppError("NOT_FOUND", "No hay datos ingestados para ese tenant, periodo y año.", 404);
  }

  const ventasPeriodo = ventasHastaPeriodo.filter((fila) => inCalendarPeriod(fila.fechaEmision, anio, periodo));
  const egresosPeriodo = egresosHastaPeriodo.filter((fila) => inCalendarPeriod(fila.fechaEmision, anio, periodo));
  const ventasYtd = ventasHastaPeriodo.filter((fila) => inYtd(fila.fechaEmision, anio, periodo));
  const egresosYtd = egresosHastaPeriodo.filter((fila) => inYtd(fila.fechaEmision, anio, periodo));

  return {
    finPeriodo,
    inicioPeriodo,
    balanzaYtd,
    tesoreriaYtd,
    balanzaMes,
    tesoreriaMes,
    ventasHastaPeriodo,
    egresosHastaPeriodo,
    ventasPeriodo,
    egresosPeriodo,
    ventasYtd,
    egresosYtd,
  };
}

export async function getHeroMetrics(tenantId: string, periodo: number, anio: number): Promise<HeroMetrics> {
  assertPeriod(periodo, anio);
  const [data, accountRoles] = await Promise.all([
    loadPeriodData(tenantId, periodo, anio),
    resolveAccountRoles(tenantId),
  ]);
  const pnl = pnlFromBalanza(data.balanzaMes);
  const treasury = treasuryFromRows(data.tesoreriaMes);
  const cashRunwayDays = treasury.salidasOperativas > 0.01 ? round2((treasury.saldoFinal / treasury.salidasOperativas) * 30) : null;
  const ebitdaMarginPct = pnl.ingresos > 0.01 ? round2((pnl.ebitda / pnl.ingresos) * 100) : null;

  const ventasPeriodoNetas = data.ventasPeriodo.filter((fila) => fila.estatusPago !== "Cancelado");
  const ventasFacturacion = round2(ventasPeriodoNetas.reduce((acc, fila) => acc + money(fila.montoSubtotal), 0));
  // CCC del hero desde balanza (mismo helper que módulo y catálogo).
  const ccc = cccFromBalanza({
    balanzaCierre: data.balanzaMes,
    balanzaMov: data.balanzaMes,
    roles: accountRoles,
  });

  const ingresosBudget = round2(
    data.balanzaMes
      .filter((fila) => fila.categoriaMaestra === "Ingreso")
      .reduce((acc, fila) => acc + money(fila.montoPresupuestado), 0),
  );
  const gastosBudget = round2(
    data.balanzaMes
      .filter((fila) => fila.categoriaMaestra === "COGS" || fila.categoriaMaestra === "OpEx")
      .reduce((acc, fila) => acc + money(fila.montoPresupuestado), 0),
  );
  const gastosReal = round2(pnl.cogs + pnl.opex);

  const byCliente = new Map<string, { idCliente: string; nombreCliente: string; facturacion: number }>();
  for (const fila of ventasPeriodoNetas) {
    const current = byCliente.get(fila.idCliente);
    const facturacion = money(fila.montoSubtotal);
    if (current) {
      current.facturacion += facturacion;
    } else {
      byCliente.set(fila.idCliente, {
        idCliente: fila.idCliente,
        nombreCliente: fila.nombreCliente,
        facturacion,
      });
    }
  }
  const ranked = [...byCliente.values()].sort((a, b) => b.facturacion - a.facturacion);
  const top5 = ranked.slice(0, 5).map((item) => {
    const facturacion = round2(item.facturacion);
    const pct = ventasFacturacion > 0.01 ? round2((facturacion / ventasFacturacion) * 100) : 0;
    return {
      idCliente: item.idCliente,
      nombreCliente: item.nombreCliente,
      facturacion,
      facturacionFormatted: formatMxn(facturacion),
      pct,
    };
  });
  const top5Facturacion = top5.reduce((acc, item) => acc + item.facturacion, 0);
  const top5Pct = ventasFacturacion > 0.01 ? round2((top5Facturacion / ventasFacturacion) * 100) : 0;

  return {
    tenantId,
    periodo,
    anio,
    freeCashFlow: treasury.freeCashFlow,
    freeCashFlowFormatted: formatMxn(treasury.freeCashFlow),
    cashRunwayDays,
    ebitdaMarginPct,
    ebit: pnl.ebit,
    ebitFormatted: formatMxn(pnl.ebit),
    da: round2(pnl.da),
    daFormatted: formatMxn(pnl.da),
    ccc,
    realVsBudget: {
      ingresosPct: ratioPct(pnl.ingresos, ingresosBudget),
      gastosPct: ratioPct(gastosReal, gastosBudget),
      ingresosReal: pnl.ingresos,
      ingresosBudget,
      gastosReal,
      gastosBudget,
      ingresosRealFormatted: formatMxn(pnl.ingresos),
      ingresosBudgetFormatted: formatMxn(ingresosBudget),
      gastosRealFormatted: formatMxn(gastosReal),
      gastosBudgetFormatted: formatMxn(gastosBudget),
    },
    customerConcentration: { top5Pct, top5 },
  };
}

function packModules(input: {
  view: "mensual" | "ytd";
  periodo: number;
  asOf: Date;
  balanzaMov: BalanzaPnL[];
  balanzaCierre: BalanzaPnL[];
  tesoreriaCorte: TesoreriaFlujo[];
  tesoreriaHistorial: TesoreriaFlujo[];
  ventasCorte: AuxiliarVentas[];
  ventasHastaCierre: AuxiliarVentas[];
  egresosCorte: AuxiliarEgresos[];
  egresosHastaCierre: AuxiliarEgresos[];
  accountRoles?: AccountRoles | null;
}): ModulePack {
  const pnl = pnlFromBalanza(input.balanzaMov);
  const structure = structureFromBalanza(input.balanzaCierre, input.accountRoles);
  const treasuryCorte = treasuryFromRows(input.tesoreriaCorte);
  const byPeriod = new Map<number, TesoreriaFlujo[]>();
  for (const fila of input.tesoreriaHistorial) {
    const list = byPeriod.get(fila.periodo) ?? [];
    list.push(fila);
    byPeriod.set(fila.periodo, list);
  }
  const periods = [...byPeriod.keys()];
  const lastPeriod = periods.length > 0 ? Math.max(...periods) : input.periodo;
  const firstPeriod = periods.length > 0 ? Math.min(...periods) : input.periodo;
  const tesoreriaCierre = byPeriod.get(lastPeriod) ?? input.tesoreriaCorte;
  const saldoCierre = treasuryFromRows(tesoreriaCierre).saldoFinal;
  const mesesEnCorte = Math.max(periods.length, 1);

  const ytdTreasury =
    input.view === "ytd"
      ? (() => {
          const summed = treasuryFromRows(input.tesoreriaCorte);
          const inicial = treasuryFromRows(byPeriod.get(firstPeriod) ?? []).saldoInicial;
          return {
            ...summed,
            saldoInicial: inicial,
            saldoFinal: saldoCierre,
            freeCashFlow: summed.freeCashFlow,
          };
        })()
      : treasuryCorte;

  return {
    saludFinanciera: buildSaludFinanciera(structure, pnl, ytdTreasury),
    flujoCaja: buildFlujoCaja({
      corte: ytdTreasury,
      historial: input.tesoreriaHistorial,
      saldoCierre,
      mesesEnCorte,
      view: input.view,
    }),
    pnl: buildPnlDetallado(pnl, ytdTreasury, input.egresosCorte),
    capitalTrabajo: buildCapitalTrabajo({
      ventasHastaCierre: input.ventasHastaCierre,
      egresosCorte: input.egresosCorte,
      egresosHastaCierre: input.egresosHastaCierre,
      balanzaCierre: input.balanzaCierre,
      balanzaMov: input.balanzaMov,
      accountRoles: input.accountRoles,
      asOf: input.asOf,
    }),
    unitEconomics: buildUnitEconomics({
      ventas: input.ventasCorte,
      egresos: input.egresosCorte,
      balanza: input.balanzaMov,
      pnl,
    }),
  };
}

export async function getFullDashboard(
  tenantId: string,
  periodo: number,
  anio: number,
  view: DashboardView | "all" = "all",
): Promise<FullDashboard> {
  assertPeriod(periodo, anio);
  const [data, accountRoles] = await Promise.all([
    loadPeriodData(tenantId, periodo, anio),
    resolveAccountRoles(tenantId),
  ]);

  const mensual =
    view === "ytd"
      ? null
      : packModules({
          view: "mensual",
          periodo,
          asOf: data.finPeriodo,
          balanzaMov: data.balanzaMes,
          balanzaCierre: data.balanzaMes,
          tesoreriaCorte: data.tesoreriaMes,
          tesoreriaHistorial: data.tesoreriaYtd,
          ventasCorte: data.ventasPeriodo,
          ventasHastaCierre: data.ventasHastaPeriodo,
          egresosCorte: data.egresosPeriodo,
          egresosHastaCierre: data.egresosHastaPeriodo,
          accountRoles,
        });

  const ytd =
    view === "mensual"
      ? null
      : packModules({
          view: "ytd",
          periodo,
          asOf: data.finPeriodo,
          balanzaMov: data.balanzaYtd,
          balanzaCierre: data.balanzaMes,
          tesoreriaCorte: data.tesoreriaYtd,
          tesoreriaHistorial: data.tesoreriaYtd,
          ventasCorte: data.ventasYtd,
          ventasHastaCierre: data.ventasHastaPeriodo,
          egresosCorte: data.egresosYtd,
          egresosHastaCierre: data.egresosHastaPeriodo,
          accountRoles,
        });

  return {
    tenantId,
    year: anio,
    period: periodo,
    views: { mensual, ytd },
    assumptions: DASHBOARD_ASSUMPTIONS,
  };
}

export function snapshotFromLoaded(
  anio: number,
  periodo: number,
  data: Awaited<ReturnType<typeof loadPeriodData>>,
  accountRoles?: AccountRoles | null,
) {
  return buildPeriodSnapshot({
    anio,
    periodo,
    balanza: data.balanzaMes,
    tesoreria: data.tesoreriaMes,
    accountRoles,
  });
}

export type MetricsCatalog = {
  tenantId: string;
  year: number;
  period: number;
  comparable: "mom" | "yoy";
  categories: CatalogCategories;
  assumptions: string[];
};

export async function getMetricsCatalog(
  tenantId: string,
  periodo: number,
  anio: number,
  comparable: "mom" | "yoy" = "mom",
): Promise<MetricsCatalog> {
  assertPeriod(periodo, anio);
  const [currentData, accountRoles] = await Promise.all([
    loadPeriodData(tenantId, periodo, anio),
    resolveAccountRoles(tenantId),
  ]);
  const current = snapshotFromLoaded(anio, periodo, currentData, accountRoles);

  const prior =
    comparable === "yoy" ? { anio: anio - 1, periodo } : previousPeriod(anio, periodo);

  let previousSnapshot = null;
  try {
    const previousData = await loadPeriodData(tenantId, prior.periodo, prior.anio);
    previousSnapshot = snapshotFromLoaded(prior.anio, prior.periodo, previousData, accountRoles);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "NOT_FOUND") {
      throw error;
    }
  }

  return {
    tenantId,
    year: anio,
    period: periodo,
    comparable,
    categories: getAllMetrics(current, previousSnapshot),
    assumptions: CATALOG_ASSUMPTIONS,
  };
}
