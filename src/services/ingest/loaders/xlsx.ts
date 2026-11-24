import ExcelJS from "exceljs";
import { AppError } from "@/auth/errors";
import type { IngestLimits } from "@/services/ingest/limits";
import type { Celda, DocumentoLeido, RangoCombinado, Seccion } from "@/services/ingest/types";

/**
 * Convierte el valor de ExcelJS a `Celda` con el mismo resultado que hoy dan
 * `cellText`/`optionalNumber` sobre el valor crudo: hipervínculo → su texto,
 * fórmula → su resultado, texto enriquecido → texto plano. Un error de Excel
 * (#N/A, #DIV/0!) queda vacío en vez de "[object Object]".
 */
export function aCelda(value: unknown): Celda {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const objeto = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if ("text" in objeto && objeto.text) {
      return typeof objeto.text === "string" ? objeto.text : aCelda(objeto.text);
    }
    if ("result" in objeto) return aCelda(objeto.result);
    if ("richText" in objeto) return (objeto.richText ?? []).map((parte) => parte.text).join("");
  }
  return null;
}

function columnaDeLetras(letras: string): number {
  let col = 0;
  for (const letra of letras.toUpperCase()) col = col * 26 + (letra.charCodeAt(0) - 64);
  return col;
}

function rangoDeDireccion(rango: string): RangoCombinado | null {
  const match = rango.match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;
  return {
    r1: Number(match[2]),
    c1: columnaDeLetras(match[1]!),
    r2: Number(match[4]),
    c2: columnaDeLetras(match[3]!),
  };
}

function seccionDeHoja(sheet: ExcelJS.Worksheet): Seccion {
  const filas: Celda[][] = [];
  for (let numero = 1; numero <= sheet.rowCount; numero += 1) {
    const row = sheet.findRow(numero);
    const valores: Celda[] = [];
    // Las celdas de un rango combinado devuelven el valor de la celda maestra.
    for (let col = 1; col <= (row?.cellCount ?? 0); col += 1) valores.push(aCelda(row!.findCell(col)?.value));
    filas.push(valores);
  }
  const combinadas = (sheet.model.merges ?? [])
    .map((rango) => rangoDeDireccion(String(rango)))
    .filter((rango): rango is RangoCombinado => rango !== null);
  return { nombre: sheet.name, filas, ...(combinadas.length ? { combinadas } : {}) };
}

/** Lector de Excel moderno (.xlsx/.xlsm). Los topes de hojas, filas y
 * columnas se revisan antes de copiar las celdas. */
export async function leerXlsx(buffer: Buffer, filename: string, limits: IngestLimits): Promise<DocumentoLeido> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      `${filename}: el archivo Excel está cifrado, corrupto o no puede leerse.`,
      400,
    );
  }
  if (workbook.worksheets.length > limits.maxSheets) {
    throw new AppError("VALIDATION_ERROR", `${filename}: excede el máximo de hojas permitido.`, 413);
  }
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > limits.maxRows || sheet.columnCount > limits.maxColumns) {
      throw new AppError("VALIDATION_ERROR", `${filename}: excede los límites de filas o columnas.`, 413);
    }
  }
  return {
    formato: "xlsx",
    secciones: workbook.worksheets.map(seccionDeHoja),
    metadatos: {},
    avisos: [],
  };
}
