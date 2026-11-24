import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Borra solo la fila en users de un cliente para volver a darlo de alta desde el portal.
 * La empresa y su contabilidad no se tocan: las cargas del usuario se reasignan al admin.
 *
 * Uso: npx tsx scripts/reset-client-user.ts            (inspección, no modifica nada)
 *      npx tsx scripts/reset-client-user.ts --confirm  (ejecuta el reset en una transacción)
 */
const TARGET_EMAIL = "emanuel.rsoler@gmail.com";
const ADMIN_EMAIL = "emanuel2698@hotmail.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

type LedgerCounts = {
  balanzasPnL: number;
  auxiliaresVentas: number;
  auxiliaresEgresos: number;
  tesoreriaFlujos: number;
  polizas: number;
};

function assertLocalDatabase(connectionString: string): void {
  const host = new URL(connectionString).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`DATABASE_URL apunta a "${host}", no a localhost. Abortado sin conectar.`);
  }
}

async function ledgerCounts(db: Tx, tenantId: string): Promise<LedgerCounts> {
  const where = { tenantId };
  const [balanzasPnL, auxiliaresVentas, auxiliaresEgresos, tesoreriaFlujos, polizas] = await Promise.all([
    db.balanzaPnL.count({ where }),
    db.auxiliarVentas.count({ where }),
    db.auxiliarEgresos.count({ where }),
    db.tesoreriaFlujo.count({ where }),
    db.poliza.count({ where }),
  ]);
  return { balanzasPnL, auxiliaresVentas, auxiliaresEgresos, tesoreriaFlujos, polizas };
}

function printCounts(label: string, counts: Record<string, number>): void {
  console.log(label);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}=${value}`);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  assertLocalDatabase(connectionString);
  const confirm = process.argv.includes("--confirm");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL }, include: { tenant: true } });
    if (!user) {
      console.log(`No existe el usuario ${TARGET_EMAIL}. Nada que hacer.`);
      return;
    }

    console.log("Usuario:");
    console.log(`  id=${user.id}`);
    console.log(`  email=${user.email}`);
    console.log(`  role=${user.role} isActive=${user.isActive}`);
    console.log(`  cognitoSub=${user.cognitoSub}`);
    console.log(`  tenant=${user.tenant.name} (${user.tenant.rfc}) tenantId=${user.tenantId}`);

    const before = await ledgerCounts(prisma, user.tenantId);
    printCounts("Conteos del tenant:", before);
    printCounts("Vinculados al usuario:", {
      ingestBatches: await prisma.ingestBatch.count({ where: { userId: user.id } }),
      ingestFileAudits: await prisma.ingestFileAudit.count({ where: { userId: user.id } }),
      appErrorLogs: await prisma.appErrorLog.count({ where: { userId: user.id } }),
    });

    if (!confirm) {
      console.log("Nada se modificó. Para ejecutar el reset corre con --confirm");
      return;
    }

    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) {
      throw new Error(`No existe el admin ${ADMIN_EMAIL}. Abortado sin cambios.`);
    }
    if (admin.id === user.id) {
      throw new Error("El usuario a borrar es el mismo admin. Abortado sin cambios.");
    }

    await prisma.$transaction(async (tx) => {
      const start = await ledgerCounts(tx, user.tenantId);
      const batches = await tx.ingestBatch.updateMany({ where: { userId: user.id }, data: { userId: admin.id } });
      const audits = await tx.ingestFileAudit.updateMany({ where: { userId: user.id }, data: { userId: admin.id } });
      await tx.user.delete({ where: { id: user.id } });
      const end = await ledgerCounts(tx, user.tenantId);

      console.log(`Reasignados al admin ${admin.email}: ingestBatches=${batches.count} ingestFileAudits=${audits.count}`);
      console.log(`Borrado: users.id=${user.id} (${user.email})`);
      printCounts("Conteos del tenant después:", end);

      const changed = (Object.keys(start) as Array<keyof LedgerCounts>).filter((key) => start[key] !== end[key]);
      if (changed.length > 0) {
        throw new Error(`Los conteos cambiaron (${changed.join(", ")}). Rollback: no se modificó nada.`);
      }
    });

    console.log("Reset completo. Los conteos financieros del tenant son idénticos a los del inicio.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
