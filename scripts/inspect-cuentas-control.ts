import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";
import { toNumber } from "../src/services/money";

/** Inspecciona el formato de las cuentas 1105/2101 en balanza y auxiliar (jul-2026). */
async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");

  const balRows = await prisma.balanzaPnL.findMany({
    where: { tenantId: tenant.id, anio: 2026, periodo: 7 },
    select: { idCuenta: true, nombreCuenta: true, saldoFinal: true },
    orderBy: { idCuenta: "asc" },
  });
  const clientes = balRows.filter((r) => r.idCuenta.replace(/\D/g, "").startsWith("1105"));
  const proveedores = balRows.filter((r) => r.idCuenta.replace(/\D/g, "").startsWith("2101"));
  console.log(`Balanza 2026-07 cuentas 1105*: ${clientes.length}`);
  for (const r of clientes.slice(0, 12)) console.log(`  ${r.idCuenta} ${r.nombreCuenta} sf=${toNumber(r.saldoFinal)}`);
  console.log(`Balanza 2026-07 cuentas 2101*: ${proveedores.length}`);
  for (const r of proveedores.slice(0, 12)) console.log(`  ${r.idCuenta} ${r.nombreCuenta} sf=${toNumber(r.saldoFinal)}`);

  const resumen = await prisma.auxiliarCuentaResumen.findMany({
    where: { tenantId: tenant.id, anio: 2026, periodo: 7, moneda: "MXN" },
    select: { idCuenta: true, nombreCuenta: true, saldoFinal: true },
    orderBy: { idCuenta: "asc" },
  });
  const resClientes = resumen.filter((r) => ["1105", "105"].includes(r.idCuenta.split("-")[0] ?? ""));
  const resProveedores = resumen.filter((r) => ["2101", "201"].includes(r.idCuenta.split("-")[0] ?? ""));
  console.log(`\nAuxiliar resumen 2026-07 MXN: total=${resumen.length} clientes=${resClientes.length} proveedores=${resProveedores.length}`);
  for (const r of resClientes.slice(0, 8)) console.log(`  C ${r.idCuenta} ${r.nombreCuenta} sf=${toNumber(r.saldoFinal)}`);
  for (const r of resProveedores.slice(0, 8)) console.log(`  P ${r.idCuenta} ${r.nombreCuenta} sf=${toNumber(r.saldoFinal)}`);
  const sumC = resClientes.reduce((s, r) => s + toNumber(r.saldoFinal), 0);
  const sumP = resProveedores.reduce((s, r) => s + toNumber(r.saldoFinal), 0);
  console.log(`  Σclientes=${sumC.toFixed(2)} Σproveedores=${sumP.toFixed(2)}`);
  const balC = clientes.reduce((s, r) => s + toNumber(r.saldoFinal), 0);
  const balP = proveedores.reduce((s, r) => s + toNumber(r.saldoFinal), 0);
  console.log(`  Balanza Σ1105*=${balC.toFixed(2)} Σ2101*=${balP.toFixed(2)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
