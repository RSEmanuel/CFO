import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitIngestFiles } from "../src/services/ingestionService";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Ingesta REAL de la historia CONTPAQi 2024-08 → 2026-06 por la MISMA ruta
 * del portal: commitIngestFiles con useFilePeriod=true (el periodo lo fija el
 * contenido del Excel, no la sesión). Un archivo = un periodo = una llamada.
 *
 * Tras CADA commit se verifica el rowcount real en balanzas_pnl; si el
 * servicio reporta éxito pero persistió 0 filas (rollback silencioso
 * histórico), el script se detiene y lo reporta.
 *
 * Idempotente a nivel datos: replaceBalance reemplaza por periodo. OJO: en
 * re-corridas el check `previous` (mismo sha256+perfil+periodo COMMITTED)
 * devuelve los counts del batch previo sin re-persistir; los datos ya están.
 *
 * Uso: npx tsx scripts/ingest-real-history.ts
 */

const DIR = join(__dirname, "..", "Data_ejemplo");
const FILE_PATTERN = /^05\.\d{2} Balanza de Comprobacion \d{6}\.xlsx$/;
const JULY_GUARD = { anio: 2026, periodo: 7 } as const;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error(`No existe el tenant Compac (${EMPTY_COMPAC_TENANT.rfc}).`);
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "CFO_PARTNER", email: "compac.partner@cfo.mx" },
  });
  if (!user) throw new Error("No existe un usuario CFO_PARTNER del tenant Compac.");
  console.log(`Tenant: ${tenant.name} id=${tenant.id}`);
  console.log(`Usuario: ${user.email} id=${user.id}\n`);

  const julyBefore = await prisma.balanzaPnL.count({
    where: { tenantId: tenant.id, ...JULY_GUARD },
  });
  console.log(`Ancla 2026-07 antes: ${julyBefore} cuentas\n`);

  const files = readdirSync(DIR).filter((name) => FILE_PATTERN.test(name)).sort();
  console.log(`Archivos a ingerir: ${files.length}\n`);

  const results: Array<{
    filename: string;
    anio: number;
    periodo: number;
    reported: number;
    persisted: number;
    warnings: number;
    reusedPrevious: boolean;
  }> = [];

  for (const filename of files) {
    const buffer = readFileSync(join(DIR, filename));
    const startedAt = Date.now();
    const result = await commitIngestFiles({
      tenantId: tenant.id,
      userId: user.id,
      // La sesión pide jul-2026, pero useFilePeriod manda: el Excel fija el periodo.
      periodo: JULY_GUARD.periodo,
      anio: JULY_GUARD.anio,
      files: [{ filename, buffer }],
      useFilePeriod: true,
    });
    const persisted = await prisma.balanzaPnL.count({
      where: { tenantId: tenant.id, anio: result.anio, periodo: result.periodo },
    });
    const reusedPrevious = persisted > 0 && persisted !== result.counts.balanza;
    results.push({
      filename,
      anio: result.anio,
      periodo: result.periodo,
      reported: result.counts.balanza,
      persisted,
      warnings: result.warnings.length,
      reusedPrevious,
    });
    console.log(
      `${filename} → ${result.anio}-${String(result.periodo).padStart(2, "0")} ` +
        `reportado=${result.counts.balanza} persistido=${persisted} ` +
        `warnings=${result.warnings.length} (${Date.now() - startedAt}ms)`,
    );
    if (persisted === 0) {
      throw new Error(
        `ROLLBACK SILENCIOSO: ${filename} reportó ${result.counts.balanza} filas pero balanzas_pnl tiene 0 para ${result.anio}-${result.periodo}.`,
      );
    }
    if (persisted !== result.counts.balanza && !reusedPrevious) {
      throw new Error(
        `Diferencia reportado/persistido en ${filename}: reportado=${result.counts.balanza} persistido=${persisted}.`,
      );
    }
  }

  const julyAfter = await prisma.balanzaPnL.count({
    where: { tenantId: tenant.id, ...JULY_GUARD },
  });
  console.log(`\nAncla 2026-07 después: ${julyAfter} cuentas (antes: ${julyBefore})`);
  if (julyAfter !== julyBefore) {
    throw new Error("La ingesta tocó el periodo certificado 2026-07.");
  }

  console.log("\n== RESUMEN ==");
  for (const row of results) {
    console.log(
      `  ${row.anio}-${String(row.periodo).padStart(2, "0")}: persistido=${row.persisted} warnings=${row.warnings}`,
    );
  }
  console.log(`\nOK: ${results.length} periodos ingeridos por la ruta del portal.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
