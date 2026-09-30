/** Descompone gasto-opex: query Prisma vs cómputo JS. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { buildGastoOpexGrupos } from "../src/services/gastoOpex";
import { trailingMonths } from "../src/services/resultadosTop5";
import { money } from "../src/services/metricsLedger";

async function main() {
  const tenantId = process.argv[2] ?? "cmtnpxzcm00003slj2os3og3p";
  const kpiMonths = trailingMonths(2026, 6, 24);

  let start = performance.now();
  const rows = await prisma.balanzaPnL.findMany({
    where: { tenantId, OR: kpiMonths.map((m) => ({ anio: m.anio, periodo: m.mes })) },
    select: { idCuenta: true, nombreCuenta: true, debe: true, haber: true, anio: true, periodo: true },
  });
  console.log(`query OR 24 meses:  ${(performance.now() - start).toFixed(0)} ms  (${rows.length} filas)`);

  start = performance.now();
  const rows2 = await prisma.balanzaPnL.findMany({
    where: { tenantId },
    select: { idCuenta: true, nombreCuenta: true, debe: true, haber: true, anio: true, periodo: true },
  });
  console.log(`query todo tenant:  ${(performance.now() - start).toFixed(0)} ms  (${rows2.length} filas)`);

  start = performance.now();
  for (const month of kpiMonths) {
    const monthRows = rows
      .filter((row) => row.anio === month.anio && row.periodo === month.mes)
      .map((row) => ({ idCuenta: row.idCuenta, nombreCuenta: row.nombreCuenta, debe: money(row.debe), haber: money(row.haber) }));
    buildGastoOpexGrupos(monthRows);
  }
  console.log(`cómputo JS 24 meses: ${(performance.now() - start).toFixed(0)} ms`);

  start = performance.now();
  const raw = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM balanzas_pnl WHERE "tenantId" = $1`,
    tenantId,
  );
  console.log(`count(*) raw SQL:   ${(performance.now() - start).toFixed(0)} ms  (${raw[0].n} filas)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
