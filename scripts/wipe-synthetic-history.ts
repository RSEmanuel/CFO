import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MONEY_TOLERANCE, toNumber } from "../src/services/money";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Limpieza destructiva SOLO local: borra TODA la historia sintética del tenant
 * Compac (periodos 2024-08 → 2026-06, generados por `seed:compac-history`) y
 * conserva únicamente el periodo real 2026-07 (balanza CONTPAQi certificada).
 *
 * Cubre todas las tablas del ledger con corte temporal (anio/periodo o fecha),
 * es idempotente y NO toca ingest_batches / ingest_file_audits (auditoría de
 * la ingesta real) ni perfiles de mapeo.
 *
 * Uso: npx tsx scripts/wipe-synthetic-history.ts
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CUTOFF = { anio: 2026, periodo: 7 } as const;
const CUTOFF_DATE = new Date("2026-07-01T00:00:00Z");
const EXPECTED_JULY_ACCOUNTS = 606;

function requireLocalConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`wipe-synthetic-history solo puede ejecutarse contra una DB local; host recibido: ${url.hostname}.`);
  }
  return connectionString;
}

/** (anio, periodo) < (2026, 7): todo lo anterior al único periodo real. */
function syntheticPeriodFilter(tenantId: string) {
  return {
    tenantId,
    OR: [{ anio: { lt: CUTOFF.anio } }, { anio: CUTOFF.anio, periodo: { lt: CUTOFF.periodo } }],
  };
}

type PeriodCount = { anio: number; periodo: number; count: number };

async function balanzaPeriodCounts(prisma: PrismaClient, tenantId: string): Promise<PeriodCount[]> {
  const rows = await prisma.balanzaPnL.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  return rows.map((row) => ({ anio: row.anio, periodo: row.periodo, count: row._count }));
}

function printPeriodCounts(label: string, counts: PeriodCount[]): void {
  console.log(`  ${label}:`);
  if (counts.length === 0) {
    console.log("    (vacío)");
    return;
  }
  for (const row of counts) {
    console.log(`    ${row.anio}-${String(row.periodo).padStart(2, "0")}: ${row.count}`);
  }
}

async function main(): Promise<void> {
  const connectionString = requireLocalConnectionString();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 0, keepAlive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
    if (!tenant) {
      throw new Error(`No existe el tenant Compac con RFC ${EMPTY_COMPAC_TENANT.rfc}.`);
    }
    const tenantId = tenant.id;
    console.log(`Tenant: ${tenant.name} (${tenant.rfc}) id=${tenantId}`);
    console.log(`Corte: se borra (anio, periodo) < (${CUTOFF.anio}, ${CUTOFF.periodo}); se conserva solo 2026-07.\n`);

    // ---- Conteos ANTES ----
    console.log("== ANTES ==");
    printPeriodCounts("balanzas_pnl", await balanzaPeriodCounts(prisma, tenantId));
    const before = {
      balanza: await prisma.balanzaPnL.count({ where: syntheticPeriodFilter(tenantId) }),
      ventas: await prisma.auxiliarVentas.count({
        where: { tenantId, fechaEmision: { lt: CUTOFF_DATE } },
      }),
      egresos: await prisma.auxiliarEgresos.count({
        where: { tenantId, fechaEmision: { lt: CUTOFF_DATE } },
      }),
      tesoreria: await prisma.tesoreriaFlujo.count({ where: syntheticPeriodFilter(tenantId) }),
      tesoreriaDetalle: await prisma.tesoreriaFlujoDetalle.count({ where: syntheticPeriodFilter(tenantId) }),
      auxiliarMovimientos: await prisma.auxiliarMovimiento.count({ where: syntheticPeriodFilter(tenantId) }),
      auxiliarCuentaResumen: await prisma.auxiliarCuentaResumen.count({ where: syntheticPeriodFilter(tenantId) }),
      budgetAssumptions: await prisma.budgetAssumption.count({
        where: { tenantId, anio: { lt: CUTOFF.anio } },
      }),
    };
    console.log("  Filas sintéticas a borrar por tabla:");
    for (const [table, count] of Object.entries(before)) {
      console.log(`    ${table}: ${count}`);
    }

    // ---- Borrado (orden irrelevante entre tablas: no hay FKs cruzadas) ----
    const deleted = {
      balanza: await prisma.balanzaPnL.deleteMany({ where: syntheticPeriodFilter(tenantId) }),
      ventas: await prisma.auxiliarVentas.deleteMany({
        where: { tenantId, fechaEmision: { lt: CUTOFF_DATE } },
      }),
      egresos: await prisma.auxiliarEgresos.deleteMany({
        where: { tenantId, fechaEmision: { lt: CUTOFF_DATE } },
      }),
      tesoreria: await prisma.tesoreriaFlujo.deleteMany({ where: syntheticPeriodFilter(tenantId) }),
      tesoreriaDetalle: await prisma.tesoreriaFlujoDetalle.deleteMany({ where: syntheticPeriodFilter(tenantId) }),
      auxiliarMovimientos: await prisma.auxiliarMovimiento.deleteMany({ where: syntheticPeriodFilter(tenantId) }),
      auxiliarCuentaResumen: await prisma.auxiliarCuentaResumen.deleteMany({ where: syntheticPeriodFilter(tenantId) }),
      budgetAssumptions: await prisma.budgetAssumption.deleteMany({
        where: { tenantId, anio: { lt: CUTOFF.anio } },
      }),
    };

    console.log("\n== BORRADAS ==");
    for (const [table, result] of Object.entries(deleted)) {
      console.log(`  ${table}: ${result.count}`);
    }

    // ---- Conteos DESPUÉS ----
    console.log("\n== DESPUÉS ==");
    const afterPeriods = await balanzaPeriodCounts(prisma, tenantId);
    printPeriodCounts("balanzas_pnl", afterPeriods);

    // ---- Verificaciones ----
    const errors: string[] = [];
    if (afterPeriods.length !== 1 || afterPeriods[0]!.anio !== CUTOFF.anio || afterPeriods[0]!.periodo !== CUTOFF.periodo) {
      errors.push(`balanzas_pnl debería tener solo 2026-07; periodos restantes: ${afterPeriods.map((p) => `${p.anio}-${p.periodo}`).join(", ") || "(ninguno)"}.`);
    } else if (afterPeriods[0]!.count !== EXPECTED_JULY_ACCOUNTS) {
      errors.push(`2026-07 debería tener ${EXPECTED_JULY_ACCOUNTS} cuentas; tiene ${afterPeriods[0]!.count}.`);
    }

    const julyRows = await prisma.balanzaPnL.findMany({
      where: { tenantId, anio: CUTOFF.anio, periodo: CUTOFF.periodo },
      select: { saldoFinal: true, debe: true, haber: true },
    });
    const sumSaldoFinal = julyRows.reduce((sum, row) => sum + toNumber(row.saldoFinal), 0);
    const sumDebe = julyRows.reduce((sum, row) => sum + toNumber(row.debe), 0);
    const sumHaber = julyRows.reduce((sum, row) => sum + toNumber(row.haber), 0);
    if (Math.abs(sumSaldoFinal) > MONEY_TOLERANCE) {
      errors.push(`Σ saldoFinal 2026-07 = ${sumSaldoFinal.toFixed(2)} (esperado ≈ 0).`);
    }
    if (Math.abs(sumDebe - sumHaber) > MONEY_TOLERANCE) {
      errors.push(`Partida doble 2026-07 rota: Σ debe=${sumDebe.toFixed(2)} vs Σ haber=${sumHaber.toFixed(2)}.`);
    }

    const survivors = {
      auxiliarMovimientos: await prisma.auxiliarMovimiento.count({ where: { tenantId } }),
      auxiliarCuentaResumen: await prisma.auxiliarCuentaResumen.count({ where: { tenantId } }),
      tesoreria: await prisma.tesoreriaFlujo.count({ where: { tenantId } }),
      tesoreriaDetalle: await prisma.tesoreriaFlujoDetalle.count({ where: { tenantId } }),
      ventas: await prisma.auxiliarVentas.count({ where: { tenantId } }),
      egresos: await prisma.auxiliarEgresos.count({ where: { tenantId } }),
      ingestBatches: await prisma.ingestBatch.count({ where: { tenantId } }),
      ingestFileAudits: await prisma.ingestFileAudit.count({ where: { tenantId } }),
    };
    console.log("\n== SUPERVIVENTES (todo el tenant, deben ser solo 2026-07 / auditoría real) ==");
    for (const [table, count] of Object.entries(survivors)) {
      console.log(`  ${table}: ${count}`);
    }

    const residualSynthetic = await prisma.balanzaPnL.count({ where: syntheticPeriodFilter(tenantId) });
    if (residualSynthetic !== 0) {
      errors.push(`Quedan ${residualSynthetic} filas sintéticas en balanzas_pnl tras el borrado.`);
    }
    if (survivors.auxiliarMovimientos === 0 || survivors.auxiliarCuentaResumen === 0) {
      errors.push("Los auxiliares reales de 2026-07 no sobrevivieron (movimientos o resumen en 0).");
    }

    console.log(`\nΣ saldoFinal 2026-07 = ${sumSaldoFinal.toFixed(2)} (tolerancia ±${MONEY_TOLERANCE})`);
    console.log(`Σ debe 2026-07 = ${sumDebe.toFixed(2)} | Σ haber 2026-07 = ${sumHaber.toFixed(2)}`);

    if (errors.length > 0) {
      console.error("\nVERIFICACIÓN FALLIDA:");
      for (const error of errors) console.error(`  - ${error}`);
      process.exit(1);
    }
    console.log("\nOK: solo queda 2026-07; partida doble y auxiliares reales intactos.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
