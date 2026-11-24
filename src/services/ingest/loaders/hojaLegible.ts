import type { Celda, Seccion } from "@/services/ingest/types";

/**
 * Lo que los parsers de balanza, flujo y auxiliar usan de una hoja. Una hoja de
 * ExcelJS lo cumple tal cual, y `hojaLegible` lo da para cualquier `Seccion`,
 * venga de Excel, CSV o TXT: así los parsers no dependen del formato.
 */
export interface CeldaLegible {
  readonly value: unknown;
}

export interface FilaLegible {
  readonly cellCount: number;
  getCell(col: number): CeldaLegible;
  eachCell(opt: { includeEmpty: boolean }, callback: (cell: CeldaLegible, col: number) => void): void;
}

export interface HojaLegible {
  readonly name: string;
  readonly rowCount: number;
  readonly columnCount: number;
  getRow(row: number): FilaLegible;
  /** Solo filas con algún valor, igual que ExcelJS. */
  eachRow(callback: (row: FilaLegible, rowNumber: number) => void): void;
}

const SIN_CELDAS: Celda[] = [];

/** Envuelve una `Seccion` con la misma semántica que una hoja de ExcelJS:
 * `rowCount` cuenta filas vacías al final, `columnCount` solo filas con valor,
 * y una fila cubierta por una celda combinada cuenta como fila con valor. */
export function hojaLegible(seccion: Seccion): HojaLegible {
  const { filas } = seccion;
  const conCombinada = new Set<number>();
  for (const rango of seccion.combinadas ?? []) {
    for (let fila = rango.r1; fila <= rango.r2; fila += 1) {
      if (fila > rango.r1 || rango.c2 > rango.c1) conCombinada.add(fila);
    }
  }
  const tieneValores = (numero: number) =>
    conCombinada.has(numero) || (filas[numero - 1] ?? SIN_CELDAS).some((valor) => valor !== null);

  const fila = (numero: number): FilaLegible => {
    const valores = filas[numero - 1] ?? SIN_CELDAS;
    return {
      cellCount: valores.length,
      getCell: (col) => ({ value: valores[col - 1] ?? null }),
      eachCell: (opt, callback) => {
        for (let col = 1; col <= valores.length; col += 1) {
          const value = valores[col - 1] ?? null;
          if (opt.includeEmpty || value !== null) callback({ value }, col);
        }
      },
    };
  };

  let columnCount = 0;
  for (let numero = 1; numero <= filas.length; numero += 1) {
    if (tieneValores(numero)) columnCount = Math.max(columnCount, filas[numero - 1]!.length);
  }

  return {
    name: seccion.nombre,
    rowCount: filas.length,
    columnCount,
    getRow: fila,
    eachRow: (callback) => {
      for (let numero = 1; numero <= filas.length; numero += 1) {
        if (tieneValores(numero)) callback(fila(numero), numero);
      }
    },
  };
}
