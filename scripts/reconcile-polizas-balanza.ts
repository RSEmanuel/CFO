import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Reconciliación mensual pólizas ↔ balanza:
 *   Σ totalCargos/totalAbonos de polizas del periodo
 *   vs
 *   Σ debe/haber de balanza_pnl del periodo (solo cuentas hoja).
 *
 * El impreso de pólizas CONTPAQi debería incluir TODAS las pólizas del
 * periodo, así que ambas sumas deben coincidir al centavo. Se marca cualquier
 * mes con diferencia material (> $0.01).
 *
 * Uso: npx tsx scripts/reconcile-polizas-balanza.ts
 */

const TOLERANCE = 0.01;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");

  const polizasPorMes = await prisma.poliza.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId: tenant.id },
    _sum: { totalCargos: true, totalAbonos: true },
    _count: { _all: true },
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  const balanzaPorMes = await prisma.balanzaPnL.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId: tenant.id },
    _sum: { debe: true, haber: true },
  });
  const balanzaMap = new Map(
    balanzaPorMes.map((row) => [`${row.anio}-${row.periodo}`, row]),
  );

  console.log("anio-periodo | pólizas | Σ cargos pólizas | Σ debe balanza | Δ cargos | Σ abonos pólizas | Σ haber balanza | Δ abonos");
  let mesesConDiferencia = 0;
  for (const mes of polizasPorMes) {
    const key = `${mes.anio}-${mes.periodo}`;
    const balanza = balanzaMap.get(key);
    const cargosPolizas = Number(mes._sum.totalCargos ?? 0);
    const abonosPolizas = Number(mes._sum.totalAbonos ?? 0);
    const debeBalanza = Number(balanza?._sum.debe ?? 0);
    const haberBalanza = Number(balanza?._sum.haber ?? 0);
    const deltaCargos = cargosPolizas - debeBalanza;
    const deltaAbonos = abonosPolizas - haberBalanza;
    const material = Math.abs(deltaCargos) > TOLERANCE || Math.abs(deltaAbonos) > TOLERANCE;
    if (material) mesesConDiferencia += 1;
    console.log(
      `${key} | ${String(mes._count._all).padStart(3)} | ` +
        `${cargosPolizas.toFixed(2)} | ${debeBalanza.toFixed(2)} | ${deltaCargos.toFixed(2)} | ` +
        `${abonosPolizas.toFixed(2)} | ${haberBalanza.toFixed(2)} | ${deltaAbonos.toFixed(2)}` +
        `${material ? "  ← DIFERENCIA" : ""}`,
    );
  }

  const mesesSinBalanza = polizasPorMes.filter((mes) => !balanzaMap.has(`${mes.anio}-${mes.periodo}`));
  if (mesesSinBalanza.length > 0) {
    console.log(`\nMeses con pólizas pero sin balanza: ${mesesSinBalanza.map((m) => `${m.anio}-${m.periodo}`).join(", ")}`);
  }
  console.log(`\n${polizasPorMes.length} meses reconciliados; ${mesesConDiferencia} con diferencia material.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
