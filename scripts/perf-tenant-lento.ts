/**
 * Mide los endpoints lentos observados en dev (gasto-opex, budget-projection)
 * contra el tenant con más datos. Uso: npx tsx scripts/perf-tenant-lento.ts [tenantId]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getGastoOpex } from "../src/services/gastoOpexService";
import { getBudgetProjection } from "../src/services/budgetProjectionService";

async function timeIt<T>(label: string, fn: () => Promise<T>, runs = 3): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  console.log(
    `${label.padEnd(46)} mediana ${(median / 1000).toFixed(2)} s  (min ${(samples[0] / 1000).toFixed(2)} / max ${(samples[samples.length - 1] / 1000).toFixed(2)})`,
  );
}

async function main() {
  const tenantId = process.argv[2] ?? "cmtnpxzcm00003slj2os3og3p";
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant ${tenantId} no existe`);
  console.log(`Tenant: ${tenant.name} (${tenantId})`);

  const [balanzaCount, ventasCount, egresosCount, tesoreriaCount, polizaCount] = await Promise.all([
    prisma.balanzaPnL.count({ where: { tenantId } }),
    prisma.auxiliarVentas.count({ where: { tenantId } }),
    prisma.auxiliarEgresos.count({ where: { tenantId } }),
    prisma.tesoreriaFlujo.count({ where: { tenantId } }),
    prisma.poliza.count({ where: { tenantId } }),
  ]);
  console.log(
    `Volumen: balanza=${balanzaCount} ventas=${ventasCount} egresos=${egresosCount} tesoreria=${tesoreriaCount} polizas=${polizaCount}\n`,
  );

  await timeIt("gasto-opex 2026-06", () => getGastoOpex(tenantId, "2026-06"));
  await timeIt("budget-projection 2026-06", () => getBudgetProjection(tenantId, "2026-06"));
  await timeIt("budget-projection 2025-12", () => getBudgetProjection(tenantId, "2025-12"));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
