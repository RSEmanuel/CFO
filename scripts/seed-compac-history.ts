import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  assertGeneratedCompacHistory,
  compacHistoryPeriods,
  generateCompacHistory,
  historyPeriodKey,
  type CompacAnchorRow,
} from "../src/services/compacHistoryGenerator";
import { MONEY_TOLERANCE, round2, toNumber } from "../src/services/money";
import { DEMO_TENANT_RFC, EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const JULY_GUARD = { anio: 2026, periodo: 7 } as const;

/**
 * NEUTRALIZADO (2026-09-14): la historia sintética 2024-08→2026-06 se borró con
 * scripts/wipe-synthetic-history.ts; el único periodo real es 2026-07 y la app
 * opera con un solo corte. Regenerar meses simulados rompería esa invariante,
 * así que este script exige ALLOW_SYNTHETIC_HISTORY=1 (opt-in explícito, p.ej.
 * para experimentos descartables en local).
 */
function requireSyntheticHistoryOptIn(): void {
  if (process.env.ALLOW_SYNTHETIC_HISTORY !== "1") {
    throw new Error(
      "seed:compac-history está deshabilitado: la historia sintética 2024-08→2026-06 se eliminó y solo 2026-07 es real. " +
        "Si de verdad necesitas regenerarla en local, corre con ALLOW_SYNTHETIC_HISTORY=1.",
    );
  }
}

type LedgerCounts = {
  balanza: number;
  ventas: number;
  egresos: number;
  tesoreria: number;
};

function requireLocalConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`seed:compac-history solo puede ejecutarse contra una DB local; host recibido: ${url.hostname}.`);
  }
  return connectionString;
}

async function ledgerCounts(prisma: PrismaClient, tenantId: string): Promise<LedgerCounts> {
  const balanza = await prisma.balanzaPnL.count({ where: { tenantId } });
  const ventas = await prisma.auxiliarVentas.count({ where: { tenantId } });
  const egresos = await prisma.auxiliarEgresos.count({ where: { tenantId } });
  const tesoreria = await prisma.tesoreriaFlujo.count({ where: { tenantId } });
  return { balanza, ventas, egresos, tesoreria };
}

function sameCounts(left: LedgerCounts, right: LedgerCounts): boolean {
  return (
    left.balanza === right.balanza &&
    left.ventas === right.ventas &&
    left.egresos === right.egresos &&
    left.tesoreria === right.tesoreria
  );
}

function canonicalJulyChecksum(
  rows: Array<{
    id: string;
    tenantId: string;
    idCuenta: string;
    nombreCuenta: string;
    categoriaMaestra: string;
    saldoInicial: unknown;
    debe: unknown;
    haber: unknown;
    saldoFinal: unknown;
    montoPresupuestado: unknown;
    depreciacionAmortizacion: boolean;
    periodo: number;
    anio: number;
    createdAt: Date;
    updatedAt: Date;
  }>,
): string {
  const canonical = [...rows]
    .sort((a, b) => a.idCuenta.localeCompare(b.idCuenta))
    .map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      categoriaMaestra: row.categoriaMaestra,
      saldoInicial: String(row.saldoInicial),
      debe: String(row.debe),
      haber: String(row.haber),
      saldoFinal: String(row.saldoFinal),
      montoPresupuestado: String(row.montoPresupuestado),
      depreciacionAmortizacion: row.depreciacionAmortizacion,
      periodo: row.periodo,
      anio: row.anio,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function toAnchorRows(
  rows: Array<{
    idCuenta: string;
    nombreCuenta: string;
    categoriaMaestra: CompacAnchorRow["categoriaMaestra"];
    saldoInicial: unknown;
    debe: unknown;
    haber: unknown;
    saldoFinal: unknown;
    montoPresupuestado: unknown;
    depreciacionAmortizacion: boolean;
    periodo: number;
    anio: number;
  }>,
): CompacAnchorRow[] {
  return rows.map((row) => ({
    ...row,
    saldoInicial: String(row.saldoInicial),
    debe: String(row.debe),
    haber: String(row.haber),
    saldoFinal: String(row.saldoFinal),
    montoPresupuestado: String(row.montoPresupuestado),
  }));
}

async function verifyPersistedHistory(
  prisma: PrismaClient,
  tenantId: string,
  anchor: CompacAnchorRow[],
  expectedJulyChecksum: string,
): Promise<{ maximumDelta: number; accountsPerMonth: number }> {
  const allRows = await prisma.balanzaPnL.findMany({
    where: { tenantId },
    orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idCuenta: "asc" }],
  });
  const julyRows = allRows.filter((row) => row.anio === JULY_GUARD.anio && row.periodo === JULY_GUARD.periodo);
  if (canonicalJulyChecksum(julyRows) !== expectedJulyChecksum) {
    throw new Error("La verificación post-escritura detectó cambios en 2026-07.");
  }

  const expectedPeriods = new Set([
    ...compacHistoryPeriods().map((period) => historyPeriodKey(period.anio, period.periodo)),
    "2026-07",
  ]);
  const rowsByPeriod = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const key = historyPeriodKey(row.anio, row.periodo);
    const bucket = rowsByPeriod.get(key) ?? [];
    bucket.push(row);
    rowsByPeriod.set(key, bucket);
  }
  if (
    rowsByPeriod.size !== 24 ||
    [...rowsByPeriod.keys()].some((key) => !expectedPeriods.has(key)) ||
    [...expectedPeriods].some((key) => !rowsByPeriod.has(key))
  ) {
    throw new Error(`Se esperaban exactamente 24 cortes de 2024-08 a 2026-07; se encontraron ${rowsByPeriod.size}.`);
  }

  const expectedIds = new Set(anchor.map((row) => row.idCuenta));
  let maximumDelta = 0;
  for (const [key, rows] of rowsByPeriod) {
    const ids = new Set(rows.map((row) => row.idCuenta));
    if (
      rows.length !== anchor.length ||
      ids.size !== expectedIds.size ||
      [...ids].some((id) => !expectedIds.has(id))
    ) {
      throw new Error(`El set de cuentas persistido en ${key} difiere del ancla 2026-07.`);
    }
    const totalDebe = round2(rows.reduce((sum, row) => sum + toNumber(row.debe), 0));
    const totalHaber = round2(rows.reduce((sum, row) => sum + toNumber(row.haber), 0));
    const delta = Math.abs(round2(totalDebe - totalHaber));
    maximumDelta = Math.max(maximumDelta, delta);
    if (key !== "2026-07" && delta > MONEY_TOLERANCE) {
      throw new Error(`Partida doble persistida inválida en ${key}: delta=${delta.toFixed(2)}.`);
    }
  }

  const sortedPeriods = [...expectedPeriods].sort();
  for (let index = 0; index < sortedPeriods.length - 1; index += 1) {
    const currentKey = sortedPeriods[index]!;
    const nextKey = sortedPeriods[index + 1]!;
    const current = rowsByPeriod.get(currentKey)!;
    const nextById = new Map(rowsByPeriod.get(nextKey)!.map((row) => [row.idCuenta, row]));
    for (const row of current.filter((item) => ["Activo", "Pasivo", "Patrimonio"].includes(item.categoriaMaestra))) {
      const next = nextById.get(row.idCuenta);
      if (!next || Math.abs(toNumber(row.saldoFinal) - toNumber(next.saldoInicial)) > MONEY_TOLERANCE) {
        throw new Error(`Encadenamiento inválido para ${row.idCuenta} entre ${currentKey} y ${nextKey}.`);
      }
    }
  }

  return { maximumDelta, accountsPerMonth: anchor.length };
}

async function main(): Promise<void> {
  requireSyntheticHistoryOptIn();
  const connectionString = requireLocalConnectionString();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 0, keepAlive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
    if (!tenant) {
      throw new Error(`No existe el tenant Compac con RFC ${EMPTY_COMPAC_TENANT.rfc}.`);
    }
    const julyRows = await prisma.balanzaPnL.findMany({
      where: { tenantId: tenant.id, ...JULY_GUARD },
      orderBy: { idCuenta: "asc" },
    });
    if (julyRows.length === 0) {
      throw new Error("No hay balanza julio 2026 en el tenant Compac. Carga el archivo 05 primero.");
    }

    const anchor = toAnchorRows(julyRows);
    const julyChecksumBefore = canonicalJulyChecksum(julyRows);
    const generated = generateCompacHistory(anchor);
    assertGeneratedCompacHistory(anchor, generated);

    const csi = await prisma.tenant.findUnique({ where: { rfc: DEMO_TENANT_RFC } });
    const csiCountsBefore = csi ? await ledgerCounts(prisma, csi.id) : null;
    const compacCountsBefore = await ledgerCounts(prisma, tenant.id);

    const [, created, simulatedCount, julyInside] = await prisma.$transaction(
      [
        prisma.balanzaPnL.deleteMany({
          where: {
            tenantId: tenant.id,
            NOT: { anio: JULY_GUARD.anio, periodo: JULY_GUARD.periodo },
          },
        }),
        prisma.balanzaPnL.createMany({
          data: generated.rows.map((row) => ({ ...row, tenantId: tenant.id })),
        }),
        prisma.balanzaPnL.count({
          where: {
            tenantId: tenant.id,
            NOT: { anio: JULY_GUARD.anio, periodo: JULY_GUARD.periodo },
          },
        }),
        prisma.balanzaPnL.findMany({
          where: { tenantId: tenant.id, ...JULY_GUARD },
          orderBy: { idCuenta: "asc" },
        }),
      ],
      { timeout: 60_000 },
    );
    if (created.count !== generated.rows.length || simulatedCount !== generated.rows.length) {
      throw new Error(
        `La transacción escribió ${created.count} filas y encontró ${simulatedCount}; se esperaban ${generated.rows.length}.`,
      );
    }
    if (canonicalJulyChecksum(julyInside) !== julyChecksumBefore) {
      throw new Error("La transacción modificó el ancla 2026-07.");
    }

    const verification = await verifyPersistedHistory(prisma, tenant.id, anchor, julyChecksumBefore);
    const compacCountsAfter = await ledgerCounts(prisma, tenant.id);
    if (
      compacCountsAfter.ventas !== compacCountsBefore.ventas ||
      compacCountsAfter.egresos !== compacCountsBefore.egresos ||
      compacCountsAfter.tesoreria !== compacCountsBefore.tesoreria
    ) {
      throw new Error("Cambió una tabla auxiliar de Compac; la corrida no cumple el alcance.");
    }
    const csiCountsAfter = csi ? await ledgerCounts(prisma, csi.id) : null;
    if (csiCountsBefore && csiCountsAfter && !sameCounts(csiCountsBefore, csiCountsAfter)) {
      throw new Error("Los conteos del tenant CSI cambiaron durante la corrida.");
    }

    console.log(`tenantId=${tenant.id}`);
    console.log(`mesesEscritos=${generated.months.length}`);
    console.log(`cuentasPorMes=${verification.accountsPerMonth}`);
    for (const month of generated.months) {
      console.log(
        `periodo=${historyPeriodKey(month.anio, month.periodo)} cuentaPuente=${month.bridgeAccountId} ajuste=${month.adjustment.toFixed(2)} deltaDebeHaber=${month.deltaDebeHaber.toFixed(2)}`,
      );
    }
    console.log(`maxAbsDebeMenosHaber=${verification.maximumDelta.toFixed(2)}`);
    console.log(`julio2026Invariante=true checksum=${julyChecksumBefore}`);
    console.log(`csiInvariante=${csi ? "true" : "N/D (tenant no existe)"}`);
    console.log("politica=REEMPLAZA todos los meses simulados de Compac y conserva 2026-07");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
