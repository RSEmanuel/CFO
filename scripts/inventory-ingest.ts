import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import ExcelJS from "exceljs";

const ROOT = join(process.cwd(), "Data_ejemplo");
const EXTS = new Set([".xlsx", ".xlsm", ".xls", ".csv", ".xml", ".pdf", ".zip", ".png", ".jpg", ".jpeg"]);

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in (value as { text?: string }) && (value as { text?: string }).text) {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return cellText((value as { result: unknown }).result);
  }
  if (typeof value === "object" && "richText" in (value as { richText?: Array<{ text: string }> })) {
    return ((value as { richText: Array<{ text: string }> }).richText ?? []).map((p) => p.text).join("").trim();
  }
  return String(value).trim();
}

function maskPii(text: string): string {
  return text
    .replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[RFC]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{10,13}\b/g, "[ID]");
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else if (EXTS.has(extname(name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function scoreType(headers: string[], blob: string): { type: string; confidence: "alta" | "media" | "baja" } {
  const h = headers.join(" ");
  const t = `${h} ${blob}`;
  const hasCuenta = /cuenta|codigo|num_cuenta|id_cuenta/.test(t);
  const hasMov = /cargos|abonos|debe|haber/.test(t);
  const hasSaldo = /saldo/.test(t);
  const hasFolio = /folio|factura|uuid/.test(t);
  const hasIva = /\biva\b/.test(t);
  const hasCliente = /cliente/.test(t);
  const hasProveedor = /proveedor/.test(t);
  const hasBanco = /banco|caja|tesorer/.test(t);
  const hasFlujo = /entrada|salida|capex|deuda/.test(t);

  if (hasCuenta && hasMov && hasSaldo && !hasFolio) {
    return { type: "balanza", confidence: "alta" };
  }
  if (hasCuenta && hasMov && !hasFolio && !hasIva) {
    return { type: "auxiliar_cuentas", confidence: "alta" };
  }
  if (hasCliente && hasFolio) {
    return { type: "auxiliar_clientes", confidence: "alta" };
  }
  if (hasProveedor && hasFolio) {
    return { type: "auxiliar_proveedores", confidence: "alta" };
  }
  if (hasBanco && hasFlujo) {
    return { type: "tesoreria", confidence: "media" };
  }
  if (hasCuenta && !hasMov) {
    return { type: "catalogo_cuentas", confidence: "media" };
  }
  return { type: "desconocido", confidence: "baja" };
}

function detectHeaderRow(rows: string[][]): number | null {
  for (let i = 0; i < Math.min(20, rows.length); i += 1) {
    const cells = rows[i] ?? [];
    const nonempty = cells.filter((c) => c.length > 0);
    const joined = nonempty.map(normalizeHeader).join(" ");
    if (nonempty.length >= 3 && /(cuenta|cargo|abono|debe|haber|folio|fecha|saldo|cliente|proveedor)/.test(joined)) {
      return i + 1;
    }
  }
  const idx = rows.findIndex((r) => r.some((c) => c.length > 0));
  return idx >= 0 ? idx + 1 : null;
}

async function inspectExcel(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheets = [];
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    for (let r = 1; r <= Math.min(20, ws.rowCount || 20); r += 1) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > 20) return;
        cells[col - 1] = maskPii(cellText(cell.value));
      });
      rows.push(cells.map((c) => c ?? ""));
    }
    const headerRow = detectHeaderRow(rows);
    const headers = headerRow ? (rows[headerRow - 1] ?? []).filter((c) => c.length > 0) : [];
    const samples = headerRow
      ? rows.slice(headerRow, headerRow + 2).map((r) => r.map(maskPii))
      : [];
    const blob = rows.flat().map(normalizeHeader).join(" ");
    const classified = scoreType(headers.map(normalizeHeader), blob);
    sheets.push({
      name: ws.name,
      headerRow,
      headers,
      samples,
      classified,
    });
  }
  return sheets;
}

async function main() {
  const files = listFiles(ROOT);
  console.log(JSON.stringify({ root: ROOT, exists: existsSync(ROOT), count: files.length, files: files.map((f) => ({
    path: f.replace(process.cwd(), ""),
    ext: extname(f).toLowerCase(),
    bytes: statSync(f).size,
  })) }, null, 2));

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const bytes = statSync(file).size;
    if (ext === ".pdf" || ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
      console.log("\n---", file);
      console.log(JSON.stringify({ ext, bytes, type: "otros", note: "no_soportado_v1" }, null, 2));
      continue;
    }
    if (ext === ".xlsx" || ext === ".xlsm") {
      try {
        const sheets = await inspectExcel(file);
        console.log("\n---", file);
        console.log(JSON.stringify({ ext, bytes, sheets }, null, 2));
      } catch (error) {
        console.log("\n---", file);
        console.log(JSON.stringify({ ext, bytes, error: String(error) }, null, 2));
      }
      continue;
    }
    console.log("\n---", file);
    console.log(JSON.stringify({ ext, bytes, note: "inspeccion_basica" }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
