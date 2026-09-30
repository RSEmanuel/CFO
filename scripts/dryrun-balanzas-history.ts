import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PROFILES } from "../src/services/ingest/builtinProfiles";
import { detectDocument } from "../src/services/ingest/detectDocument";
import { mapToMasterWorkbook } from "../src/services/ingest/applyMapping";
import { round2 } from "../src/services/money";

/**
 * Dry-run SIN DB: detecta perfil/periodo y mapea cada balanza 05.xx de
 * Data_ejemplo para validar la inferencia de periodo y la partida doble
 * antes de persistir. Uso: npx tsx scripts/dryrun-balanzas-history.ts
 */

const DIR = join(__dirname, "..", "Data_ejemplo");
const FILE_PATTERN = /^05\.\d{2} Balanza de Comprobacion (\d{2})(\d{2})(\d{2})\.xlsx$/;

function expectedPeriodFromFilename(filename: string): { anio: number; periodo: number } | null {
  const match = filename.match(FILE_PATTERN);
  if (!match) return null;
  const anio = 2000 + Number(match[3]);
  const periodo = Number(match[2]);
  return { anio, periodo };
}

async function main(): Promise<void> {
  const files = readdirSync(DIR)
    .filter((name) => FILE_PATTERN.test(name))
    .sort();
  console.log(`Archivos encontrados: ${files.length}\n`);

  const header = [
    "archivo".padEnd(44),
    "tipo".padEnd(10),
    "persist".padEnd(8),
    "períodoInf".padEnd(11),
    "períodoNom".padEnd(11),
    "match".padEnd(6),
    "filas".padStart(6),
    "ΣsaldoFinal".padStart(14),
    "Σdebe-Σhaber".padStart(14),
    "perfil",
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length + 20));

  let failures = 0;
  for (const filename of files) {
    const buffer = readFileSync(join(DIR, filename));
    const detected = await detectDocument(buffer, filename, BUILTIN_PROFILES);
    const profile = BUILTIN_PROFILES.find((p) => p.id === detected.selectedProfileId) ?? null;
    const expected = expectedPeriodFromFilename(filename);
    const inferred =
      detected.inferredPeriodo && detected.inferredAnio
        ? { periodo: detected.inferredPeriodo, anio: detected.inferredAnio }
        : null;
    const periodMatch =
      expected && inferred && expected.periodo === inferred.periodo && expected.anio === inferred.anio;

    let rows = 0;
    let sumFinal = 0;
    let deltaDebeHaber = 0;
    let mapError = "";
    if (detected.persistable && detected.documentType === "balanza" && profile && inferred) {
      try {
        const mapped = await mapToMasterWorkbook({
          buffer,
          filename,
          documentType: detected.documentType,
          sourceSystem: detected.sourceSystem,
          sheetName: detected.sheetName,
          profile,
          periodo: inferred.periodo,
          anio: inferred.anio,
        });
        rows = mapped.workbook.balanza.length;
        sumFinal = round2(mapped.workbook.balanza.reduce((s, r) => s + r.saldoFinal, 0));
        const debe = mapped.workbook.balanza.reduce((s, r) => s + r.debe, 0);
        const haber = mapped.workbook.balanza.reduce((s, r) => s + r.haber, 0);
        deltaDebeHaber = round2(debe - haber);
      } catch (error) {
        mapError = error instanceof Error ? error.message : String(error);
      }
    }

    const ok =
      detected.persistable &&
      detected.documentType === "balanza" &&
      periodMatch &&
      rows > 0 &&
      Math.abs(sumFinal) < 0.01 &&
      Math.abs(deltaDebeHaber) < 0.01 &&
      !mapError;
    if (!ok) failures += 1;

    console.log(
      [
        filename.padEnd(44),
        detected.documentType.padEnd(10),
        String(detected.persistable).padEnd(8),
        (inferred ? `${inferred.anio}-${String(inferred.periodo).padStart(2, "0")}` : "N/D").padEnd(11),
        (expected ? `${expected.anio}-${String(expected.periodo).padStart(2, "0")}` : "N/D").padEnd(11),
        (periodMatch ? "OK" : "DIFF").padEnd(6),
        String(rows).padStart(6),
        sumFinal.toFixed(2).padStart(14),
        deltaDebeHaber.toFixed(2).padStart(14),
        `${detected.selectedProfileId ?? "none"} score=${detected.confidence}`,
      ].join(" "),
    );
    if (mapError) console.log(`    ERROR mapeo: ${mapError}`);
    if (!detected.persistable) console.log(`    nota: ${detected.notes.join(" | ")}`);
  }
  console.log(`\nArchivos con problemas: ${failures} de ${files.length}`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
