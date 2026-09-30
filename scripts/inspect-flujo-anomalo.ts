import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { cellText } from "../src/services/ingest/cells";

/** Inspecciona la estructura cruda de los flujos ene/feb-2025 que no matchean el perfil. */
async function main(): Promise<void> {
  const DIR = join(__dirname, "..", "Data_ejemplo");
  for (const filename of ["03.06 Flujo de Efectivo 310125.xlsx", "03.07 Flujo de Efectivo 280225.xlsx", "03.05 Flujo de Efectivo 311224.xlsx"]) {
    console.log(`\n===== ${filename} =====`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(readFileSync(join(DIR, filename)) as unknown as ArrayBuffer);
    for (const sheet of workbook.worksheets) {
      console.log(`  Hoja: "${sheet.name}" filas=${sheet.rowCount} cols=${sheet.columnCount}`);
      for (let r = 1; r <= Math.min(sheet.rowCount, 40); r += 1) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= Math.min(sheet.columnCount, 6); c += 1) {
          cells.push(cellText(row.getCell(c).value));
        }
        console.log(`    r${r}: ${JSON.stringify(cells)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
