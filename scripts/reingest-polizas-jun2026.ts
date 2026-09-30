import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commitIngestFiles } from "../src/services/ingestionService";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Re-ingesta de 08.23 (jun-2026) tras el fix del parser que ahora captura
 * pólizas vacías (Egresos 6, total 0/0). La dedup por sha256 haría
 * early-return con los counts previos, así que primero se borra el audit
 * COMMITTED de ese archivo; la persistencia scoped (delete+insert por
 * periodo) mantiene la operación idempotente.
 *
 * Uso: npx tsx scripts/reingest-polizas-jun2026.ts
 */

const FILE = "08.23 Diarios y Polizas 300626.xlsx";

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "CFO_PARTNER", email: "compac.partner@cfo.mx" },
  });
  if (!user) throw new Error("No existe el usuario CFO_PARTNER.");

  const buffer = readFileSync(join(__dirname, "..", "Data_ejemplo", FILE));
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const audits = await prisma.ingestFileAudit.findMany({
    where: { tenantId: tenant.id, sha256, status: "COMMITTED" },
    select: { id: true, batchId: true },
  });
  console.log(`Audits COMMITTED previos: ${audits.length}`);
  for (const audit of audits) {
    await prisma.ingestFileAudit.delete({ where: { id: audit.id } });
    const remaining = await prisma.ingestFileAudit.count({ where: { batchId: audit.batchId } });
    if (remaining === 0) {
      await prisma.ingestBatch.delete({ where: { id: audit.batchId } });
    }
  }

  const result = await commitIngestFiles({
    tenantId: tenant.id,
    userId: user.id,
    periodo: 7,
    anio: 2026,
    files: [{ filename: FILE, buffer }],
    useFilePeriod: true,
  });
  const where = { tenantId: tenant.id, anio: result.anio, periodo: result.periodo };
  const polizas = await prisma.poliza.count({ where });
  const movimientos = await prisma.polizaMovimiento.count({ where });
  console.log(
    `${FILE} → ${result.anio}-${result.periodo}: reportado=${result.counts.polizas}/${result.counts.polizaMovimientos} ` +
      `persistido=${polizas}/${movimientos} warnings=${result.warnings.length}`,
  );
  if (polizas !== 95 || movimientos !== 729) {
    throw new Error(`Esperaba 95 pólizas y 729 movimientos, hay ${polizas}/${movimientos}.`);
  }
  console.log("OK: jun-2026 ahora tiene las 95 pólizas impresas (incluida la vacía).");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
