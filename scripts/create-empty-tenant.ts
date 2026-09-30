import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";
import { ensureEmptyCompacWorkspace } from "../src/services/tenants/emptyWorkspace";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await ensureEmptyCompacWorkspace(prisma, {
      name: argValue("--name") ?? EMPTY_COMPAC_TENANT.name,
      rfc: argValue("--rfc") ?? EMPTY_COMPAC_TENANT.rfc,
    });
    console.log("Empresa vacía lista.");
    console.log(`tenantId=${result.tenant.id}`);
    console.log(`rfc=${result.tenant.rfc}`);
    console.log(`name=${result.tenant.name}`);
    console.log(`partner=${result.partner} viewer=${result.viewer}`);
    console.log(
      `ledger balanza=${result.ledger.balanza} ventas=${result.ledger.ventas} egresos=${result.ledger.egresos} tesoreria=${result.ledger.tesoreria}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
