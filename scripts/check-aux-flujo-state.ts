import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Inspección del estado actual de auxiliares (movimientos/resumen por moneda),
 * tesorería (flujos/detalle) y balanzas por periodo.
 * Uso: npx tsx scripts/check-aux-flujo-state.ts
 */
async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");
  console.log(`Tenant: ${tenant.name} id=${tenant.id}\n`);

  const bal = await prisma.balanzaPnL.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId: tenant.id },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  console.log("== balanzas_pnl ==");
  for (const b of bal) console.log(`  ${b.anio}-${String(b.periodo).padStart(2, "0")}: ${b._count}`);

  const auxMov = await prisma.auxiliarMovimiento.groupBy({
    by: ["anio", "periodo", "moneda"],
    where: { tenantId: tenant.id },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }, { moneda: "asc" }],
  });
  console.log("\n== auxiliar_movimientos ==");
  for (const b of auxMov) console.log(`  ${b.anio}-${String(b.periodo).padStart(2, "0")} ${b.moneda}: ${b._count}`);

  const auxRes = await prisma.auxiliarCuentaResumen.groupBy({
    by: ["anio", "periodo", "moneda"],
    where: { tenantId: tenant.id },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }, { moneda: "asc" }],
  });
  console.log("\n== auxiliar_cuenta_resumen ==");
  for (const b of auxRes) console.log(`  ${b.anio}-${String(b.periodo).padStart(2, "0")} ${b.moneda}: ${b._count}`);

  const tes = await prisma.tesoreriaFlujo.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId: tenant.id },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  console.log("\n== tesoreria_flujos ==");
  for (const b of tes) console.log(`  ${b.anio}-${String(b.periodo).padStart(2, "0")}: ${b._count}`);

  const tesDet = await prisma.tesoreriaFlujoDetalle.groupBy({
    by: ["anio", "periodo"],
    where: { tenantId: tenant.id },
    _count: true,
    orderBy: [{ anio: "asc" }, { periodo: "asc" }],
  });
  console.log("\n== tesoreria_flujo_detalle ==");
  for (const b of tesDet) console.log(`  ${b.anio}-${String(b.periodo).padStart(2, "0")}: ${b._count}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
