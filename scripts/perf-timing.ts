/**
 * Medición de tiempos de los servicios detrás de /api/metrics/*.
 * Uso: npx tsx scripts/perf-timing.ts [tenantId] [anio] [periodo]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getFullDashboard, loadPeriodData } from "../src/services/metricsService";
import { getResultados } from "../src/services/resultadosService";
import { getFlujo } from "../src/services/flujoService";
import { getCobranza } from "../src/services/cobranzaService";

async function timeIt<T>(label: string, fn: () => Promise<T>, runs = 5): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  console.log(
    `${label.padEnd(44)} mediana ${median.toFixed(1)} ms  (min ${samples[0].toFixed(1)} / max ${samples[samples.length - 1].toFixed(1)})`,
  );
  return median;
}

async function main() {
  let tenantId = process.argv[2] ?? "";
  if (!tenantId) {
    const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
    if (!tenant) throw new Error("No hay tenants en la base.");
    tenantId = tenant.id;
    console.log(`tenantId detectado: ${tenantId} (${tenant.name})`);
  }

  const latest = await prisma.balanzaPnL.findFirst({
    where: { tenantId },
    orderBy: [{ anio: "desc" }, { periodo: "desc" }],
    select: { anio: true, periodo: true },
  });
  const anio = Number(process.argv[3] ?? latest?.anio ?? new Date().getFullYear());
  const periodo = Number(process.argv[4] ?? latest?.periodo ?? 12);
  console.log(`Midiendo con anio=${anio} periodo=${periodo}\n`);

  // Calentar conexión/pool
  await prisma.tenant.findUnique({ where: { id: tenantId } });
  await getFullDashboard(tenantId, periodo, anio);

  await timeIt("loadPeriodData (solo Prisma, 4 lecturas)", () => loadPeriodData(tenantId, periodo, anio));
  await timeIt("full-dashboard view=all (mensual+ytd)", () => getFullDashboard(tenantId, periodo, anio));
  await timeIt("full-dashboard view=mensual", () => getFullDashboard(tenantId, periodo, anio, "mensual"));
  await timeIt("full-dashboard view=ytd", () => getFullDashboard(tenantId, periodo, anio, "ytd"));
  await timeIt("resultados", () => getResultados(tenantId));
  await timeIt("flujo", () => getFlujo(tenantId));
  await timeIt("cobranza", () => getCobranza(tenantId));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
