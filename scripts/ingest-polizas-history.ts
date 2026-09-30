import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitIngestFiles } from "../src/services/ingestionService";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Ingesta REAL de la historia CONTPAQi 2024-08 → 2026-07 del reporte
 *   08.xx Diarios y Pólizas → polizas + poliza_movimientos
 * por la MISMA ruta del portal: commitIngestFiles con useFilePeriod=true.
 * Un archivo = un periodo = una llamada.
 *
 * Tras CADA commit se verifica el rowcount real en polizas/poliza_movimientos;
 * si el servicio reporta éxito pero persistió 0 filas, el script se detiene.
 *
 * Ancla jul-2026 (balanza/auxiliares/tesorería ya certificados): se verifica
 * intacta al inicio y al final — la ingesta de pólizas NO toca esas tablas.
 *
 * Uso: npx tsx scripts/ingest-polizas-history.ts
 */

const DIR = join(__dirname, "..", "Data_ejemplo");
const FILE_PATTERN = /^08\.(\d{2} )?.+\.xlsx$/;
const JULY_GUARD = { anio: 2026, periodo: 7 } as const;
// La sesión apunta a jul-2026, pero useFilePeriod manda: el Excel fija el periodo.
const SESSION_PERIODO = 7;
const SESSION_ANIO = 2026;

async function julyAnchor(tenantId: string) {
  const [balanza, auxMov, auxRes, tes, tesDet] = await Promise.all([
    prisma.balanzaPnL.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.auxiliarMovimiento.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.auxiliarCuentaResumen.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.tesoreriaFlujo.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.tesoreriaFlujoDetalle.count({ where: { tenantId, ...JULY_GUARD } }),
  ]);
  return { balanza, auxMov, auxRes, tes, tesDet };
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error(`No existe el tenant Compac (${EMPTY_COMPAC_TENANT.rfc}).`);
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "CFO_PARTNER", email: "compac.partner@cfo.mx" },
  });
  if (!user) throw new Error("No existe un usuario CFO_PARTNER del tenant Compac.");
  console.log(`Tenant: ${tenant.name} id=${tenant.id}`);
  console.log(`Usuario: ${user.email} id=${user.id}\n`);

  const before = await julyAnchor(tenant.id);
  console.log(`Ancla 2026-07 antes: ${JSON.stringify(before)}\n`);

  const files = readdirSync(DIR).filter((name) => FILE_PATTERN.test(name)).sort();
  console.log(`Archivos a ingerir: ${files.length}\n`);

  const results: Array<{
    filename: string;
    anio: number;
    periodo: number;
    polizas: number;
    movimientos: number;
    persistedPolizas: number;
    persistedMovimientos: number;
    descuadradas: number;
    warnings: number;
    ms: number;
  }> = [];
  const warningMessages = new Map<string, number>();

  for (const filename of files) {
    const buffer = readFileSync(join(DIR, filename));
    const startedAt = Date.now();
    const result = await commitIngestFiles({
      tenantId: tenant.id,
      userId: user.id,
      periodo: SESSION_PERIODO,
      anio: SESSION_ANIO,
      files: [{ filename, buffer }],
      useFilePeriod: true,
    });
    const ms = Date.now() - startedAt;
    const where = { tenantId: tenant.id, anio: result.anio, periodo: result.periodo };

    const persistedPolizas = await prisma.poliza.count({ where });
    const persistedMovimientos = await prisma.polizaMovimiento.count({ where });
    const descuadradas = await prisma.poliza.count({ where: { ...where, cuadrada: false } });
    if (persistedPolizas === 0 || persistedMovimientos === 0) {
      throw new Error(
        `ROLLBACK SILENCIOSO: ${filename} reportó polizas=${result.counts.polizas} movimientos=${result.counts.polizaMovimientos} pero polizas=${persistedPolizas} poliza_movimientos=${persistedMovimientos} en ${result.anio}-${result.periodo}.`,
      );
    }
    if (persistedPolizas !== result.counts.polizas || persistedMovimientos !== result.counts.polizaMovimientos) {
      throw new Error(
        `Diferencia reportado/persistido en ${filename}: reportado=${result.counts.polizas}/${result.counts.polizaMovimientos} persistido=${persistedPolizas}/${persistedMovimientos}.`,
      );
    }
    for (const warning of result.warnings) {
      warningMessages.set(warning.message, (warningMessages.get(warning.message) ?? 0) + 1);
    }
    results.push({
      filename,
      anio: result.anio,
      periodo: result.periodo,
      polizas: result.counts.polizas,
      movimientos: result.counts.polizaMovimientos,
      persistedPolizas,
      persistedMovimientos,
      descuadradas,
      warnings: result.warnings.length,
      ms,
    });
    console.log(
      `${filename} → ${result.anio}-${String(result.periodo).padStart(2, "0")} ` +
        `pólizas=${persistedPolizas} movimientos=${persistedMovimientos} descuadradas=${descuadradas} ` +
        `warnings=${result.warnings.length} (${ms}ms)`,
    );
  }

  const after = await julyAnchor(tenant.id);
  console.log(`\nAncla 2026-07 después: ${JSON.stringify(after)}`);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("La ingesta de pólizas tocó las tablas certificadas de 2026-07.");
  }

  console.log("\n== RESUMEN ==");
  for (const row of results) {
    console.log(
      `  ${row.anio}-${String(row.periodo).padStart(2, "0")}: pólizas=${row.persistedPolizas} movimientos=${row.persistedMovimientos} descuadradas=${row.descuadradas} warnings=${row.warnings}`,
    );
  }
  const totalPolizas = results.reduce((sum, row) => sum + row.persistedPolizas, 0);
  const totalMovimientos = results.reduce((sum, row) => sum + row.persistedMovimientos, 0);
  const totalDescuadradas = results.reduce((sum, row) => sum + row.descuadradas, 0);
  console.log(`\nTOTAL: ${totalPolizas} pólizas, ${totalMovimientos} movimientos, ${totalDescuadradas} descuadradas.`);
  console.log("\n== WARNINGS DISTINTOS ==");
  for (const [message, count] of [...warningMessages.entries()].sort()) {
    console.log(`  ×${count}  ${message}`);
  }
  console.log(`\nOK: ${results.length} archivos ingeridos por la ruta del portal.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
