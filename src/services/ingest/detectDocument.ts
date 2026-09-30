import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { AppError } from "@/auth/errors";
import { cellText, inferPeriodFromText, normalizeToken } from "@/services/ingest/cells";
import { COMPAC_AUXILIAR_PROFILE, COMPAC_BALANZA_PROFILE, COMPAC_FLUJO_EFECTIVO_PROFILE, COMPAC_POLIZAS_PROFILE, MASTER_BALANZA_PROFILE } from "@/services/ingest/builtinProfiles";
import { getIngestLimits, validateWorkbookContainer } from "@/services/ingest/limits";
import type {
  DetectResult,
  IngestDocumentType,
  IngestSourceSystem,
  MappingProfileShape,
  ProfileCandidate,
} from "@/services/ingest/types";

type SheetFingerprint = {
  name: string;
  blob: string;
  rawBlob: string;
  headers: string[];
  headerStartRow: number | null;
  headerRow: number | null;
  scannedRows: number;
  physicalRows: number;
  columns: number;
};

function normalized(value: string): string {
  return normalizeToken(value);
}

function mergedCellText(sheet: ExcelJS.Worksheet, row: number, col: number): string {
  const cell = sheet.getCell(row, col);
  if (cell.isMerged && cell.master) return cellText(cell.master.value);
  return cellText(cell.value);
}

function fingerprintSheet(
  sheet: ExcelJS.Worksheet,
  maxColumns: number,
  profiles: MappingProfileShape[],
): SheetFingerprint {
  const scanRows = Math.min(50, Math.max(sheet.rowCount, 1));
  const columns = Math.min(
    maxColumns,
    Math.max(1, ...Array.from({ length: scanRows }, (_, i) => sheet.getRow(i + 1).cellCount)),
  );
  const matrix = Array.from({ length: scanRows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => mergedCellText(sheet, r + 1, c + 1)),
  );
  let headerStartRow: number | null = null;
  let headerRow: number | null = null;
  let headers: string[] = [];
  let bestHeaderScore = 0;

  // La cabecera real vive arriba (todos los perfiles la declaran ≤ fila 12);
  // sin tope, tablas al pie del reporte (p. ej. la "Precaución" de CONTPAQi
  // con Fecha/Tipo/Cuenta/Nombre) ganan por tener más marcadores genéricos.
  const maxHeaderScanRow = Math.max(
    20,
    ...profiles.map((profile) => profile.matcherConfig.headerRowRange?.[1] ?? 0),
  );

  const rowLooksLikeData = (row: string[]) => {
    const first = row.find((value) => value.trim().length > 0) ?? "";
    const numericCells = row.filter((value) => {
      const compact = value.replace(/[$,\s]/g, "");
      return compact !== "" && Number.isFinite(Number(compact));
    }).length;
    return /^\d{2,}(?:[-.]\d+)*$/.test(first.trim()) && numericCells >= 2;
  };

  const markers = Array.from(new Set([
    "cuenta",
    "nombre",
    "cargos",
    "abonos",
    "debe",
    "haber",
    "saldos_iniciales",
    "saldos_actuales",
    "fecha",
    "folio",
    ...profiles.flatMap((profile) => profile.matcherConfig.requiredHeaders ?? []),
  ].map(normalizeToken)));
  const headerScanLimit = Math.min(matrix.length, maxHeaderScanRow);
  for (let windowSize = 1; windowSize <= 3; windowSize += 1) {
    for (let start = 0; start + windowSize <= headerScanLimit; start += 1) {
      const window = matrix.slice(start, start + windowSize);
      if (window.some(rowLooksLikeData)) {
        continue;
      }
      const combined = Array.from({ length: columns }, (_, column) =>
        window
          .map((row) => normalizeToken(row[column]))
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .join("_"),
      ).filter(Boolean);
      const matched = new Set(
        markers.filter((marker) =>
          combined.some((header) => header.includes(normalizeToken(marker))),
        ),
      );
      const score = matched.size;
      if (score >= 2 && score > bestHeaderScore) {
        bestHeaderScore = score;
        headerStartRow = start + 1;
        headerRow = start + windowSize;
        headers = combined;
      }
    }
  }
  return {
    name: sheet.name,
    blob: matrix.flat().filter(Boolean).map(normalizeToken).join(" "),
    rawBlob: matrix.flat().filter(Boolean).join(" "),
    headers,
    headerStartRow,
    headerRow,
    scannedRows: scanRows,
    physicalRows: sheet.rowCount,
    columns,
  };
}

function ratio(matches: number, total: number): number {
  return total === 0 ? 1 : matches / total;
}

function scoreProfile(profile: MappingProfileShape, sheets: SheetFingerprint[]): ProfileCandidate {
  const config = profile.matcherConfig;
  const sheetNames = sheets.map((sheet) => normalized(sheet.name));
  const allHeaders = sheets.flatMap((sheet) => sheet.headers.map(normalized));
  const content = sheets.map((sheet) => sheet.blob).join(" ");
  const requiredSheets = config.requiredSheets ?? [];
  const requiredHeaders = config.requiredHeaders ?? [];
  const tokens = config.tokens ?? [];
  const sheetMatches = requiredSheets.filter((token) => sheetNames.some((name) => name.includes(normalized(token))));
  const headerMatches = requiredHeaders.filter((token) => allHeaders.some((header) => header.includes(normalized(token))));
  const tokenMatches = tokens.filter((token) => content.includes(normalized(token)));
  const headerInRange = !config.headerRowRange || sheets.some((sheet) =>
    sheet.headerRow != null &&
    sheet.headerRow >= config.headerRowRange![0] &&
    sheet.headerRow <= config.headerRowRange![1]);
  const weights = {
    sheets: config.weights?.sheets ?? 0.25,
    headers: config.weights?.headers ?? 0.45,
    tokens: config.weights?.tokens ?? 0.25,
    headerRow: config.weights?.headerRow ?? 0.05,
  };
  const applicable = [
    requiredSheets.length ? weights.sheets : 0,
    requiredHeaders.length ? weights.headers : 0,
    tokens.length ? weights.tokens : 0,
    config.headerRowRange ? weights.headerRow : 0,
  ];
  const denominator = applicable.reduce((sum, value) => sum + value, 0) || 1;
  const score = (
    ratio(sheetMatches.length, requiredSheets.length) * applicable[0] +
    ratio(headerMatches.length, requiredHeaders.length) * applicable[1] +
    ratio(tokenMatches.length, tokens.length) * applicable[2] +
    (headerInRange ? 1 : 0) * applicable[3]
  ) / denominator;
  return {
    profileId: profile.id,
    profileKey: profile.profileKey,
    profileVersion: profile.version,
    origin: profile.origin,
    sourceSystem: profile.sourceSystem,
    documentType: profile.documentType,
    score: Number(score.toFixed(4)),
    matched: [...sheetMatches.map((x) => `hoja:${x}`), ...headerMatches.map((x) => `header:${x}`), ...tokenMatches.map((x) => `token:${x}`)],
    missing: [
      ...requiredSheets.filter((x) => !sheetMatches.includes(x)).map((x) => `hoja:${x}`),
      ...requiredHeaders.filter((x) => !headerMatches.includes(x)).map((x) => `header:${x}`),
      ...tokens.filter((x) => !tokenMatches.includes(x)).map((x) => `token:${x}`),
    ],
  };
}

function classifyGeneral(content: string): { source: IngestSourceSystem; type: IngestDocumentType; confidence: number; note: string } {
  const source: IngestSourceSystem = /compac|balanza de comprobacion|auxiliares del catalogo|impreso de polizas/.test(content) ? "compac" : "unknown";
  const rules: Array<[RegExp, IngestDocumentType, number, string]> = [
    [/auxiliares del catalogo/, "auxiliar_cuentas", 0.9, "Auxiliar de cuentas CONTPAQi; requiere un perfil compatible para persistir movimientos."],
    [/posicion financiera|balance general/, "posicion_financiera", 0.8, "Usa la balanza de comprobación."],
    [/estado de resultados/, "estado_resultados", 0.8, "PyG se deriva de la balanza."],
    [/flujo de efectivo/, "flujo_efectivo", 0.78, "Se detectó un reporte de flujo de efectivo; requiere un perfil compatible para persistirlo."],
    [/origen y aplicacion/, "origen_recursos", 0.75, "Informe no persistible."],
    [/polizas|impreso de polizas/, "diarios_polizas", 0.88, "Impreso de pólizas CONTPAQi; requiere un perfil compatible para persistirlas."],
  ];
  for (const [pattern, type, confidence, note] of rules) {
    if (pattern.test(content)) return { source, type, confidence, note };
  }
  return { source, type: "desconocido", confidence: 0.2, note: "No hay huella suficiente para mapear." };
}

export async function detectDocument(
  buffer: Buffer,
  filename: string,
  profiles: MappingProfileShape[] = [MASTER_BALANZA_PROFILE, COMPAC_BALANZA_PROFILE, COMPAC_FLUJO_EFECTIVO_PROFILE, COMPAC_AUXILIAR_PROFILE, COMPAC_POLIZAS_PROFILE],
): Promise<DetectResult> {
  const limits = getIngestLimits();
  validateWorkbookContainer(buffer, filename, limits);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
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
    throw new AppError(
      "VALIDATION_ERROR",
      `${filename}: excede el máximo de hojas permitido.`,
      413,
    );
  }
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > limits.maxRows || sheet.columnCount > limits.maxColumns) {
      throw new AppError(
        "VALIDATION_ERROR",
        `${filename}: excede los límites de filas o columnas.`,
        413,
      );
    }
    return fingerprintSheet(sheet, limits.maxColumns, profiles);
  });
  const candidates = profiles.filter((profile) => profile.isActive).map((profile) => scoreProfile(profile, sheets))
    .sort((a, b) => b.score - a.score || b.profileVersion - a.profileVersion);
  const best = candidates[0];
  const bestProfile = best ? profiles.find((profile) => profile.id === best.profileId) : undefined;
  const second = candidates[1];
  const minimum = bestProfile?.matcherConfig.minimumScore ?? 0.7;
  const margin = bestProfile?.matcherConfig.ambiguityMargin ?? 0.08;
  const ambiguous = Boolean(best && second && best.score >= minimum && second.score >= minimum && best.score - second.score <= margin);
  const selected = best && best.score >= minimum && !ambiguous ? best : null;
  const content = sheets.map((sheet) => `${sheet.blob} ${sheet.headers.join(" ")}`).join(" ");
  const rawContent = sheets.map((sheet) => sheet.rawBlob).join(" ");
  const classificationContent = rawContent
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const general = classifyGeneral(classificationContent);
  const period = inferPeriodFromText(rawContent);
  const selectedSheet = sheets.find((sheet) => {
    const profile = selected ? profiles.find((item) => item.id === selected.profileId) : null;
    return profile?.sheetMatch ? normalized(sheet.name).includes(normalized(profile.sheetMatch)) : sheet.headerRow != null;
  }) ?? sheets[0];
  const masterStructure = ["balanza_pnl", "auxiliar_ventas", "auxiliar_egresos", "tesoreria_flujo"].every((required) =>
    sheets.some((sheet) => normalized(sheet.name).includes(normalized(required))));
  const sourceSystem: IngestSourceSystem = masterStructure
    ? "master_template"
    : selected?.sourceSystem ?? general.source;
  const documentType: IngestDocumentType =
    masterStructure
      ? "master_workbook"
      : selected?.documentType ?? general.type;
  const flujoProfileReady =
    documentType !== "flujo_efectivo" ||
    Boolean(
      selected && profiles.find((profile) => profile.id === selected.profileId)?.flujoConfig,
    );
  const flujoNote =
    selected && documentType === "flujo_efectivo"
      ? "Flujo de efectivo CONTPAQi; se persistirá tesorería y detalle por categoría."
      : selected && documentType === "auxiliar_cuentas"
        ? "Auxiliar de cuentas CONTPAQi; se persistirán los movimientos diarios y el resumen por cuenta."
        : selected && documentType === "diarios_polizas"
          ? "Impreso de pólizas CONTPAQi; se persistirán las pólizas y sus movimientos."
          : general.note;
  return {
    detectionId: randomUUID(),
    sha256,
    filename,
    sourceSystem,
    documentType,
    headerStartRow: selectedSheet?.headerStartRow ?? null,
    headerRow: selectedSheet?.headerRow ?? null,
    sheetName: selectedSheet?.name ?? null,
    headers: selectedSheet?.headers ?? [],
    confidence: selected?.score ?? general.confidence,
    persistable: Boolean(
      selected &&
        flujoProfileReady &&
        (documentType === "balanza" ||
          documentType === "flujo_efectivo" ||
          documentType === "auxiliar_cuentas" ||
          documentType === "diarios_polizas" ||
          sourceSystem === "master_template"),
    ),
    inferredPeriodo: period?.periodo ?? null,
    inferredAnio: period?.anio ?? null,
    rowCountEstimate: Math.max(
      0,
      (selectedSheet?.physicalRows ?? 0) - (selectedSheet?.headerRow ?? 0),
    ),
    missingCanonical: best?.missing.filter((item) => item.startsWith("header:")).map((item) => item.slice(7)) ?? [],
    notes: [ambiguous ? "Se requiere seleccionar un perfil antes de confirmar." : flujoNote],
    errorCode: ambiguous ? "AMBIGUOUS_MAPPING" : undefined,
    selectedProfileId: selected?.profileId ?? null,
    profileCandidates: candidates,
    evidence: {
      sheetsScanned: sheets.map((sheet) => sheet.name),
      rowsScanned: sheets.reduce((sum, sheet) => sum + sheet.scannedRows, 0),
      columnsScanned: Math.max(0, ...sheets.map((sheet) => sheet.columns)),
      matchedTokens: best?.matched ?? [],
      contentPeriod: period ? `${period.periodo}/${period.anio}` : null,
    },
  };
}
