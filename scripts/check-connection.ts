import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const tenants = await prisma.tenant.count();
  const balanzas = await prisma.balanzaPnL.count();
  const polizas = await prisma.poliza.count();
  console.log(`Prisma Client OK - tenants: ${tenants} | balanzas: ${balanzas} | polizas: ${polizas}`);
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
