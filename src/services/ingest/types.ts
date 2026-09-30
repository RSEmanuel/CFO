export type IngestDocumentType =
  | "master_workbook"
  | "balanza"
  | "auxiliar_cuentas"
  | "auxiliar_clientes"
  | "auxiliar_proveedores"
  | "tesoreria"
  | "catalogo_cuentas"
  | "posicion_financiera"
  | "estado_resultados"
  | "flujo_efectivo"
  | "origen_recursos"
  | "diarios_polizas"
  | "desconocido";

export type IngestSourceSystem = "master_template" | "compac" | "unknown";

export type PartidaDobleMode = "full" | "balance_only" | "off";

export type ColumnMap = Record<string, string[]>;

export type IngestProfileOrigin = "BUILTIN" | "TENANT";

export type MatcherConfig = {
  requiredSheets?: string[];
  optionalSheets?: string[];
  requiredHeaders?: string[];
  headerRowRange?: [number, number];
  tokens?: string[];
  minimumScore: number;
  ambiguityMargin?: number;
  weights?: {
    sheets?: number;
    headers?: number;
    tokens?: number;
    headerRow?: number;
  };
};

export type AccountPrefixRules = {
  leafOnly?: boolean;
  byPrefix: Record<string, "Activo" | "Pasivo" | "Patrimonio" | "Ingreso" | "COGS" | "OpEx">;
  nameExceptions?: Array<{
    pattern: string;
    categoria: "Activo" | "Pasivo" | "Patrimonio" | "Ingreso" | "COGS" | "OpEx";
  }>;
};

export type AccountRoleRule = {
  prefixes: string[];
  nameTokens?: string[];
};

export type AccountRoles = {
  clientes?: AccountRoleRule;
  proveedores?: AccountRoleRule;
  ingresos?: AccountRoleRule;
  costos?: AccountRoleRule;
  gastos?: AccountRoleRule;
  bancos?: AccountRoleRule;
  /** Rubro de inventarios para DIO/CCC desde balanza (auditoría C1). En el
   * catálogo Compac no hay prefijo de inventario (111x son IVA/ISR/deudores),
   * así que el default resuelve por nombre; sin cuentas de inventario el DIO
   * es 0 legítimo. */
  inventario?: AccountRoleRule;
  /** Pasivos con costo CP+LP que forman la deuda financiera (auditoría C3).
   * Default Compac: 2106 (TDC/líneas/préstamos) + 2306 (anticipos LP) + 2359
   * (impuestos diferidos). */
  deudaFinanciera?: AccountRoleRule;
  /** Overrides de estructura de balance (B1/B2). Si están presentes, ganan sobre
   * el default de isCurrentAsset/isCurrentLiability; el no circulante gana sobre
   * el circulante cuando una cuenta matchea ambos. */
  activoCirculante?: AccountRoleRule;
  activoNoCirculante?: AccountRoleRule;
  pasivoCirculante?: AccountRoleRule;
  pasivoNoCirculante?: AccountRoleRule;
  /** Estructura NIF del capital contable (auditoría B3). Prefijos default del
   * catálogo Compac verificado en DB: 3101/3102 capital social y aportaciones,
   * 3103 reservas, 3104/3105 resultados de ejercicios anteriores. Las cuentas
   * 3xxx que ningún rol reclama caen en "Otras cuentas de capital" (catch-all)
   * para no romper el cuadre con catálogos ajenos. */
  capitalSocial?: AccountRoleRule;
  reservas?: AccountRoleRule;
  resultadosAcumulados?: AccountRoleRule;
  /** Cuenta 3xxx de resultado del ejercicio (catálogos que la llevan en el
   * balance; en Compac no existe — el resultado YTD se calcula del PyG). */
  resultadoEjercicio?: AccountRoleRule;
};

export type FlujoSectionTokens = {
  saldoInicial: string[];
  ingresos: string[];
  totalIngresos: string[];
  disponible: string[];
  egresos: string[];
  totalEgresos: string[];
  saldoFinal: string[];
  ingresoPrefix: string[];
  egresoPrefix: string[];
  traspaso: string[];
};

export type MappingProfileShape = {
  id: string;
  origin: IngestProfileOrigin;
  tenantId: string | null;
  profileKey: string;
  version: number;
  isActive: boolean;
  fingerprintHash: string;
  name: string;
  sourceSystem: IngestSourceSystem;
  documentType: IngestDocumentType;
  headerRow: number;
  sheetMatch: string | null;
  columnMap: ColumnMap;
  enumMap: Record<string, Record<string, string>>;
  accountPrefixRules: AccountPrefixRules | null;
  accountRoles: AccountRoles | null;
  matcherConfig: MatcherConfig;
  flujoConfig: FlujoSectionTokens | null;
  partidaDobleMode: PartidaDobleMode;
  bridgeTesoreriaFromBalanza: boolean;
};

export type ProfileCandidate = {
  profileId: string;
  profileKey: string;
  profileVersion: number;
  origin: IngestProfileOrigin;
  sourceSystem: IngestSourceSystem;
  documentType: IngestDocumentType;
  score: number;
  matched: string[];
  missing: string[];
};

export type DetectionEvidence = {
  sheetsScanned: string[];
  rowsScanned: number;
  columnsScanned: number;
  matchedTokens: string[];
  contentPeriod: string | null;
};

export type DetectResult = {
  detectionId?: string;
  sha256: string;
  filename: string;
  sourceSystem: IngestSourceSystem;
  documentType: IngestDocumentType;
  headerStartRow: number | null;
  headerRow: number | null;
  sheetName: string | null;
  headers: string[];
  confidence: number;
  persistable: boolean;
  inferredPeriodo: number | null;
  inferredAnio: number | null;
  rowCountEstimate: number;
  mappedRowCount?: number;
  missingCanonical: string[];
  notes: string[];
  errorCode?: "AMBIGUOUS_MAPPING";
  selectedProfileId: string | null;
  profileCandidates: ProfileCandidate[];
  evidence: DetectionEvidence;
};

export const CONFIDENCE_THRESHOLD = 0.7;

export const MASTER_SHEETS = [
  "balanza_pnl",
  "auxiliar_ventas",
  "auxiliar_egresos",
  "tesoreria_flujo",
] as const;
