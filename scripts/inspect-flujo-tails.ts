import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { cellText } from "../src/services/ingest/cells";

/** Revisa la cola de todos los flujos 03.xx: ¿tienen sección "Precaución" con filas de datos? */
async function main(): Promise<void> {
  const DIR = join(__dirname, "..", "Data_ejemplo");
  const files = readdirSync(DIR).filter((name) => /^03\.\d{2} /.test(name)).sort();
  for (const filename of files) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(readFileSync(join(DIR, filename)) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    let precaucionRow = -1;
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const first = cellText(sheet.getRow(r).getCell(1).value);
      if (first.toLowerCase().startsWith("precauci")) {
        precaucionRow = r;
        break;
      }
    }
    const tailRows = precaucionRow > 0 ? sheet.rowCount - precaucionRow : 0;
    console.log(
      `${filename}: filas=${sheet.rowCount} cols=${sheet.columnCount} precaucion=${precaucionRow > 0 ? `r${precaucionRow} (+${tailRows} filas)` : "no"}`,
    );
    if (precaucionRow > 0) {
      for (let r = precaucionRow; r <= Math.min(sheet.rowCount, precaucionRow + 8); r += 1) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= Math.min(sheet.columnCount, 8); c += 1) {
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
