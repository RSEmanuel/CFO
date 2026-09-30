import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_TENANT_RFC, EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Limpieza destructiva SOLO local: elimina el tenant demo CSI y cualquier otro
 * tenant que no sea el de ingesta real (Compac). Conserva perfiles BUILTIN.
 * Uso: npx tsx scripts/wipe-demo-ledger.ts
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function requireLocalConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`wipe-demo-ledger solo puede ejecutarse contra una DB local; host recibido: ${url.hostname}.`);
  }
  return connectionString;
}

async function main(): Promise<void> {
  const connectionString = requireLocalConnectionString();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 0, keepAlive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, rfc: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (tenants.length === 0) {
      console.log("No hay tenants; nada que limpiar.");
      return;
    }

    // El tenant a conservar: el de ingesta real (Compac). Si no existe, se
    // conserva el más reciente (el que probablemente recibió la carga real).
    const keep =
      tenants.find((tenant) => tenant.rfc === EMPTY_COMPAC_TENANT.rfc) ??
      tenants.at(-1)!;
    const drop = tenants.filter((tenant) => tenant.id !== keep.id);

    console.log(`Conservando tenant: ${keep.name} (${keep.rfc}) id=${keep.id}`);
    for (const tenant of drop) {
      console.log(`Eliminando tenant: ${tenant.name} (${tenant.rfc}) id=${tenant.id}`);
      // IngestBatch/IngestFileAudit referencian User con onDelete: Restrict.
      // Los batches pueden vivir en OTRO tenant (seed cruzado), así que se
      // borran por userId además de por tenantId. Luego usuarios y tenant.
      const userIds = await prisma.user.findMany({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      const ids = userIds.map((u) => u.id);
      await prisma.ingestBatch.deleteMany({
        where: { OR: [{ tenantId: tenant.id }, { userId: { in: ids } }] },
      });
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }

    // Limpieza residual: cualquier fila de ledger huérfana de tenants borrados
    // no debería existir por cascade, pero se reporta el estado final.
    const remaining = await prisma.tenant.findMany({
      select: { id: true, name: true, rfc: true },
      orderBy: { name: "asc" },
    });
    console.log("\nTenants que quedan:");
    for (const tenant of remaining) {
      const periods = await prisma.balanzaPnL.groupBy({
        by: ["anio", "periodo"],
        where: { tenantId: tenant.id },
        _count: true,
        orderBy: [{ anio: "asc" }, { periodo: "asc" }],
      });
      console.log(`  ${tenant.name} (${tenant.rfc}) id=${tenant.id}`);
      if (periods.length === 0) {
        console.log("    sin balanza");
      } else {
        for (const period of periods) {
          console.log(`    ${period.anio}-${String(period.periodo).padStart(2, "0")}: ${period._count} cuentas`);
        }
      }
    }

    const builtinProfiles = await prisma.ingestMappingProfile.count({ where: { origin: "BUILTIN" } });
    console.log(`\nPerfiles BUILTIN conservados: ${builtinProfiles}`);
    console.log(`Total tenants: ${remaining.length}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
