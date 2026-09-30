import ExcelJS from "exceljs";

export type ColumnMode = "lectura" | "sistemas";
export type FileKind = "xlsx" | "csv";
export type TableCell = string | number | null;
export type TableRow = TableCell[];

export type WorkbookMeta = {
  tenant: string;
  reporte: string;
  generatedAt: string;
};

export function slugAscii(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sin-dato";
}

function csvEscape(value: TableCell): string {
  if (value == null) {
    return "";
  }
  const raw = typeof value === "number" ? String(value) : value;
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildCsv(headers: string[], rows: TableRow[]): string {
  const lines = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))];
  return `\uFEFF${lines.join("\n")}`;
}

export async function buildWorkbook(
  headers: string[],
  rows: TableRow[],
  meta: WorkbookMeta,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.tenant;
  workbook.created = new Date(meta.generatedAt);
  workbook.modified = workbook.created;

  const sheet = workbook.addWorksheet("Datos");
  sheet.addRow([`tenant=${meta.tenant}`, `reporte=${meta.reporte}`, `generatedAt=${meta.generatedAt}`]);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  return workbook;
}

export async function workbookToBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
