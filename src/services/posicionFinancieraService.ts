import { AppError } from "@/auth/errors";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAllMetrics, type CatalogCategories } from "@/services/financialEngine";
import type { AccountRoles } from "@/services/ingest/types";
import { resolveAccountRoles } from "@/services/ingresoMixService";
import { loadPeriodData, snapshotFromLoaded } from "@/services/metricsService";
import { getLedgerPeriods } from "@/services/ledgerPeriodService";
import {
  alignResultadosMonths,
  buildBalanzaTree,
  buildPosicionTree,
  buildRazonesTree,
  buildResultadosTree,
  type AlignedMonths,
  type PosicionFinancieraPayload,
} from "@/services/posicionFinanciera";

export type { PosicionFinancieraPayload };

function yearKey(year: number): string {
  return String(year);
}

async function closePeriod(tenantId: string, anio: number): Promise<number | null> {
  const row = await prisma.balanzaPnL.findFirst({
    where: { tenantId, anio },
    orderBy: { periodo: "desc" },
    select: { periodo: true },
  });
  return row?.periodo ?? null;
}

async function loadSnapshotCategories(
  tenantId: string,
  anio: number,
  periodo: number,
  accountRoles?: AccountRoles | null,
): Promise<CatalogCategories | null> {
  try {
    const currentData = await loadPeriodData(tenantId, periodo, anio);
    const current = snapshotFromLoaded(anio, periodo, currentData, accountRoles);
    let previous = null;
    try {
      const previousData = await loadPeriodData(tenantId, periodo, anio - 1);
      previous = snapshotFromLoaded(anio - 1, periodo, previousData, accountRoles);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "NOT_FOUND") {
        throw error;
      }
    }
    return getAllMetrics(current, previous);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function getPosicionFinanciera(
  tenantId: string,
  yearParam: number | null,
  periodParam: number | null,
): Promise<PosicionFinancieraPayload> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  const ledgerPeriods = await getLedgerPeriods(tenantId);
  const availableYears = Array.from(
    new Set(ledgerPeriods.availablePeriods.map((value) => Number(value.slice(0, 4)))),
  ).sort((a, b) => b - a);
  const latest = ledgerPeriods.latestPeriod
    ? Number(ledgerPeriods.latestPeriod.slice(0, 4))
    : null;
  let resolvedYear = yearParam ?? latest;
  if (resolvedYear != null && availableYears.length > 0 && !availableYears.includes(resolvedYear)) {
    resolvedYear = latest ?? availableYears[0];
  }

  if (resolvedYear == null) {
    return {
      tenantId,
      year: yearParam ?? new Date().getFullYear(),
      period: periodParam ?? 12,
      years: yearParam ? [yearParam, yearParam - 1, yearParam - 2] : [],
      closePeriodByYear: {},
      resultadosMonthsByYear: {},
      availableYears: [],
      availablePeriods: [],
      hasBalanza: false,
      statements: { posicion: [], resultados: [], razones: [], balanza: [] },
      balanzaTotals: { debe: 0, haber: 0 },
    };
  }

  if (yearParam != null && (!Number.isInteger(yearParam) || yearParam < 2000 || yearParam > 2100)) {
    throw new AppError("VALIDATION_ERROR", "El año debe ser un entero válido.", 400);
  }

  const candidateYears = [resolvedYear, resolvedYear - 1, resolvedYear - 2];
  const closePeriodByYear: Record<string, number | null> = {};
  await Promise.all(
    candidateYears.map(async (anio) => {
      closePeriodByYear[yearKey(anio)] = await closePeriod(tenantId, anio);
    }),
  );

  // Solo años con corte real: si el tenant tiene un solo periodo (p.ej. tras
  // borrar la historia sintética), las columnas de años sin data desaparecen
  // en vez de renderizarse vacías.
  const years = candidateYears.filter(
    (anio) => anio === resolvedYear || closePeriodByYear[yearKey(anio)] != null,
  );
  const yearKeys = years.map(yearKey);

  const periodRows = await prisma.balanzaPnL.findMany({
    where: { tenantId, anio: resolvedYear },
    distinct: ["periodo"],
    select: { periodo: true },
    orderBy: { periodo: "asc" },
  });
  const availablePeriods = periodRows.map((row) => row.periodo);
  const defaultPeriod = closePeriodByYear[yearKey(resolvedYear)] ?? 12;
  const period =
    periodParam != null && availablePeriods.includes(periodParam) ? periodParam : defaultPeriod;

  if (periodParam != null && (!Number.isInteger(periodParam) || periodParam < 1 || periodParam > 12)) {
    throw new AppError("VALIDATION_ERROR", "El periodo debe ser un entero entre 1 y 12.", 400);
  }

  // Estado de resultados: el año elegido suma sus meses reales hasta su cierre y
  // cada año anterior suma solo esos mismos números de mes (sin rellenar faltantes).
  const selectedCierre = closePeriodByYear[yearKey(resolvedYear)];
  const selectedMonths = availablePeriods.filter((month) => selectedCierre != null && month <= selectedCierre);
  const resultadosMonthsByYear: Record<string, AlignedMonths> = {};

  const epfByYear: Record<string, BalanzaPnL[]> = {};
  const pygByYear: Record<string, BalanzaPnL[]> = {};
  await Promise.all(
    years.map(async (anio) => {
      const key = yearKey(anio);
      const cierre = closePeriodByYear[key];
      if (cierre == null) {
        epfByYear[key] = [];
        pygByYear[key] = [];
        resultadosMonthsByYear[key] = { months: [], missing: selectedMonths };
        return;
      }
      const monthRows =
        anio === resolvedYear
          ? null
          : await prisma.balanzaPnL.findMany({
              where: { tenantId, anio },
              distinct: ["periodo"],
              select: { periodo: true },
            });
      const aligned =
        monthRows == null
          ? { months: selectedMonths, missing: [] }
          : alignResultadosMonths(selectedMonths, monthRows.map((row) => row.periodo));
      resultadosMonthsByYear[key] = aligned;
      const [cierreRows, ytdRows] = await Promise.all([
        prisma.balanzaPnL.findMany({ where: { tenantId, anio, periodo: cierre } }),
        aligned.months.length > 0
          ? prisma.balanzaPnL.findMany({ where: { tenantId, anio, periodo: { in: aligned.months } } })
          : Promise.resolve([]),
      ]);
      epfByYear[key] = cierreRows;
      pygByYear[key] = ytdRows;
    }),
  );

  const accountRoles = await resolveAccountRoles(tenantId);
  const categoriesByYear: Record<string, CatalogCategories | null> = {};
  await Promise.all(
    years.map(async (anio) => {
      const key = yearKey(anio);
      const cierre = closePeriodByYear[key];
      categoriesByYear[key] =
        cierre == null ? null : await loadSnapshotCategories(tenantId, anio, cierre, accountRoles);
    }),
  );

  const balanzaRows = await prisma.balanzaPnL.findMany({
    where: { tenantId, anio: resolvedYear, periodo: period },
    orderBy: { idCuenta: "asc" },
  });
  const balanza = buildBalanzaTree(balanzaRows);

  return {
    tenantId,
    year: resolvedYear,
    period,
    years,
    closePeriodByYear,
    resultadosMonthsByYear,
    availableYears,
    availablePeriods,
    hasBalanza: availableYears.length > 0,
    statements: {
      posicion: buildPosicionTree(epfByYear, yearKeys, accountRoles),
      resultados: buildResultadosTree(pygByYear, yearKeys),
      razones: buildRazonesTree(categoriesByYear, yearKeys),
      balanza: balanza.nodes,
    },
    balanzaTotals: balanza.totals,
  };
}
