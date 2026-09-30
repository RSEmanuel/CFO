import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { BUILTIN_PROFILES } from "../src/services/ingest/builtinProfiles";
import { ensureEmptyCompacWorkspace } from "../src/services/tenants/emptyWorkspace";

/**
 * Seed mínimo: solo perfiles builtin de ingesta + tenant vacío Compac.
 * Ya no se crea el tenant demo CSI ni sus 12 meses sintéticos; la data real
 * entra por /ingesta.
 */
function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL para ejecutar el seed.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function main(): Promise<void> {
  const prisma = createPrisma();

  try {
    for (const profile of BUILTIN_PROFILES) {
      await prisma.ingestMappingProfile.createMany({
        skipDuplicates: true,
        data: [{
          id: profile.id,
          tenantId: null,
          origin: "BUILTIN",
          profileKey: profile.profileKey,
          version: profile.version,
          isActive: profile.isActive,
          fingerprintHash: profile.fingerprintHash,
          name: profile.name,
          sourceSystem: profile.sourceSystem,
          documentType: profile.documentType,
          headerRow: profile.headerRow,
          sheetMatch: profile.sheetMatch,
          columnMap: profile.columnMap,
          enumMap: profile.enumMap,
          accountPrefixRules: profile.accountPrefixRules ?? Prisma.JsonNull,
          matcherConfig: profile.matcherConfig,
          partidaDobleMode: profile.partidaDobleMode,
          bridgeTesoreriaFromBalanza: profile.bridgeTesoreriaFromBalanza,
        }],
      });
    }
    console.log(`Perfiles BUILTIN registrados: ${BUILTIN_PROFILES.length}`);

    const empty = await ensureEmptyCompacWorkspace(prisma);
    console.log("Tenant Compac vacío listo (sin ledger).");
    console.log(`compacTenantId=${empty.tenant.id}`);
    console.log(`compacRfc=${empty.tenant.rfc}`);
    console.log(`compacEmpresa=${empty.tenant.name}`);
    console.log(
      `compacLedger balanza=${empty.ledger.balanza} ventas=${empty.ledger.ventas} egresos=${empty.ledger.egresos} tesoreria=${empty.ledger.tesoreria}`,
    );
    console.log("Usuarios: compac.partner@cfo.mx (CFO_PARTNER), compac.viewer@cfo.mx (CLIENT_VIEWER).");
    console.log("Ingesta: selecciona esa empresa y corte julio 2026 (periodo 7, anio 2026).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
