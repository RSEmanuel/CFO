import { AppError } from "@/auth/errors";

export type IngestLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxSheets: number;
  maxRows: number;
  maxColumns: number;
  maxZipEntries: number;
  maxUncompressedBytes: number;
};

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getIngestLimits(): IngestLimits {
  return {
    maxFiles: envInt("INGEST_MAX_FILES", 10),
    maxFileBytes: envInt("INGEST_MAX_FILE_BYTES", 20 * 1024 * 1024),
    maxSheets: envInt("INGEST_MAX_SHEETS", 30),
    maxRows: envInt("INGEST_MAX_ROWS", 100_000),
    maxColumns: envInt("INGEST_MAX_COLUMNS", 256),
    maxZipEntries: envInt("INGEST_MAX_ZIP_ENTRIES", 2_000),
    maxUncompressedBytes: envInt("INGEST_MAX_UNCOMPRESSED_BYTES", 200 * 1024 * 1024),
  };
}

export function validateFileCount(count: number, limits = getIngestLimits()): void {
  if (count < 1 || count > limits.maxFiles) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Adjunta entre 1 y ${limits.maxFiles} archivos por lote.`,
      400,
    );
  }
}

export function validateWorkbookContainer(
  buffer: Buffer,
  filename: string,
  limits = getIngestLimits(),
): void {
  if (!/\.(xlsx|xlsm)$/i.test(filename)) {
    throw new AppError("VALIDATION_ERROR", `${filename}: solo se aceptan archivos .xlsx o .xlsm.`, 400);
  }
  if (buffer.length > limits.maxFileBytes) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${filename}: excede el límite de ${Math.ceil(limits.maxFileBytes / 1024 / 1024)} MB.`,
      413,
    );
  }
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    throw new AppError(
      "VALIDATION_ERROR",
      ole
        ? `${filename}: el libro está cifrado o usa un formato Excel antiguo no soportado.`
        : `${filename}: la extensión no coincide con un archivo Excel OOXML válido.`,
      400,
    );
  }

  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) {
    throw new AppError("VALIDATION_ERROR", `${filename}: el archivo ZIP está corrupto o incompleto.`, 400);
  }
  const declaredEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let entries = 0;
  let uncompressed = 0;
  const names = new Set<string>();
  while (entries < declaredEntries && offset + 46 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new AppError("VALIDATION_ERROR", `${filename}: el directorio ZIP está corrupto.`, 400);
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if ((flags & 1) !== 0) {
      throw new AppError("VALIDATION_ERROR", `${filename}: el archivo Excel está cifrado.`, 400);
    }
    const nameStart = offset + 46;
    if (nameStart + nameLength + extraLength + commentLength > buffer.length) {
      throw new AppError("VALIDATION_ERROR", `${filename}: el directorio ZIP está truncado.`, 400);
    }
    names.add(buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    entries += 1;
    uncompressed += uncompressedSize;
    if (entries > limits.maxZipEntries || uncompressed > limits.maxUncompressedBytes) {
      throw new AppError("VALIDATION_ERROR", `${filename}: el contenido comprimido excede los límites seguros.`, 413);
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${filename}: el archivo está corrupto o no contiene una estructura OOXML válida.`,
      400,
    );
  }
}
