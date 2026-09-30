import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectDocument } from "../src/services/ingest/detectDocument";

/**
 * Dry-run de detección (sin persistir) para los reportes históricos 03/06/07.
 * Valida documentType, persistable, periodo inferido y perfil seleccionado.
 * Uso: npx tsx scripts/dryrun-aux-flujo-history.ts
 */

const DIR = join(__dirname, "..", "Data_ejemplo");
const FILE_PATTERN = /^(03|06|07)\.\d{2} .+\d{6}( MXN| USD)?\.xlsx$/;

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((name) => FILE_PATTERN.test(name)).sort();
  console.log(`Archivos en scope: ${files.length}\n`);
  const problems: string[] = [];

  for (const filename of files) {
    const buffer = readFileSync(join(DIR, filename));
    const result = await detectDocument(buffer, filename);
    const periodo =
      result.inferredPeriodo && result.inferredAnio
        ? `${result.inferredAnio}-${String(result.inferredPeriodo).padStart(2, "0")}`
        : "SIN-PERIODO";
    const ok =
      result.persistable &&
      result.inferredPeriodo != null &&
      result.inferredAnio != null &&
      ((filename.startsWith("03") && result.documentType === "flujo_efectivo") ||
        ((filename.startsWith("06") || filename.startsWith("07")) &&
          result.documentType === "auxiliar_cuentas"));
    if (!ok) {
      problems.push(
        `${filename}: type=${result.documentType} persistable=${result.persistable} periodo=${periodo} profile=${result.selectedProfileId} notas=${result.notes.join(" | ")}`,
      );
    }
    console.log(
      `${ok ? "OK " : "BAD"} ${filename} → type=${result.documentType} periodo=${periodo} ` +
        `profile=${result.selectedProfileId} conf=${result.confidence} filas~=${result.rowCountEstimate}`,
    );
  }

  console.log(`\n== RESUMEN ==`);
  console.log(`  OK: ${files.length - problems.length}/${files.length}`);
  if (problems.length > 0) {
    console.log(`  PROBLEMAS:`);
    for (const p of problems) console.log(`    - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
