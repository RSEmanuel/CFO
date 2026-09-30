import type { AccountRoles, MappingProfileShape } from "@/services/ingest/types";

// Convención CONTPAQi/SAT: clientes = activo (agrupador SAT 105, mayor 1105),
// NUNCA 4101 (eso es ingreso de PyG). Los tenants pueden sobreescribir estos
// roles con createTenantProfile sin tocar código.
export const COMPAC_ACCOUNT_ROLES: AccountRoles = {
  clientes: { prefixes: ["1105", "105"], nameTokens: ["clientes"] },
  proveedores: { prefixes: ["2101", "201"], nameTokens: ["proveedores"] },
  ingresos: { prefixes: ["4", "401", "410"], nameTokens: ["ingreso", "ventas"] },
  costos: { prefixes: ["5"] },
  gastos: { prefixes: ["6"] },
  bancos: { prefixes: ["1102", "102"], nameTokens: ["bancos", "banco"] },
  // Inventario (auditoría C1): el catálogo Compac NO tiene rubro de inventario
  // por prefijo — 111x son IVA/ISR a favor y deudores, no almacén — así que el
  // rol se resuelve solo por nombre. Sin cuentas de inventario, DIO = 0 y
  // CCC = DSO − DPO (legítimo, no un hueco de datos).
  inventario: { prefixes: [], nameTokens: ["inventario", "almacen", "mercancia"] },
  // Deuda financiera completa (auditoría C3): 2106 agrupa TDC + líneas de
  // crédito + préstamos (CP); 2306 anticipos de clientes y 2359 impuestos
  // diferidos son los pasivos LP del catálogo.
  deudaFinanciera: { prefixes: ["2106", "2306", "2359"] },
  // Estructura circulante/no circulante (auditoría B1): 11xx = disponible y
  // deudores; 119x es activo fijo (automóviles) en este catálogo; 12xx+ =
  // activo fijo y sus contra-cuentas (1200/1202/1207 dep. acumulada restan del
  // activo fijo). 13xx/14xx no existen en el catálogo Compac.
  activoCirculante: {
    prefixes: ["110", "111", "112", "113", "114", "115", "116", "117", "118"],
  },
  activoNoCirculante: { prefixes: ["119", "12", "13", "14", "15", "16", "17", "18", "19"] },
  // Deuda CP/LP (auditoría B2): 2106 agrupa TDC + líneas de crédito +
  // préstamos; sin dato para separar CP/LP dentro de 2106, todo queda CP.
  // 2306 (anticipos de clientes) y 2359 impuestos diferidos son LP.
  pasivoCirculante: { prefixes: ["21", "22"] },
  pasivoNoCirculante: { prefixes: ["23", "24", "25", "26", "27", "28", "29"] },
  // Estructura NIF del capital contable (auditoría B3), verificada contra el
  // catálogo real en DB: 3101 capital social y 3102 aportaciones patrimoniales;
  // 3103 reserva legal; 3104/3105 utilidades/pérdidas y resultados de
  // ejercicios anteriores. 3106 y cualquier 3xxx no mapeada caen en el
  // catch-all "Otras cuentas de capital". El resultado del ejercicio (YTD) se
  // calcula del PyG; el rol solo aplica a catálogos que lo llevan en el 3xxx.
  capitalSocial: {
    prefixes: ["3101", "3102"],
    nameTokens: ["capital social", "capital variable", "aportacion"],
  },
  reservas: { prefixes: ["3103"], nameTokens: ["reserva"] },
  resultadosAcumulados: {
    prefixes: ["3104", "3105"],
    nameTokens: ["ejercicios anteriores", "utilidades retenidas", "resultados acumulados"],
  },
  resultadoEjercicio: { prefixes: [], nameTokens: ["resultado del ejercicio"] },
};

export const COMPAC_BALANZA_PROFILE: MappingProfileShape = {
  id: "builtin_compac_balanza_v1",
  origin: "BUILTIN",
  tenantId: null,
  profileKey: "compac/balanza",
  version: 1,
  isActive: true,
  fingerprintHash: "6475c73b1c24c56695b59c935f3b4f1beec9b63fc8f6678d3901df2c861fcd14",
  name: "Compac / balanza de comprobación",
  sourceSystem: "compac" as const,
  documentType: "balanza" as const,
  headerRow: 5,
  sheetMatch: "balanza de comprobacion",
  columnMap: {
    idCuenta: ["__col:1", "cuenta", "c_u_e_n_t_a"],
    nombreCuenta: ["__col:2", "nombre", "n_o_m_b_r_e"],
    saldoInicialDeudor: ["__col:3"],
    saldoInicialAcreedor: ["__col:4"],
    debe: ["__col:5", "cargos"],
    haber: ["__col:6", "abonos"],
    saldoFinalDeudor: ["__col:7"],
    saldoFinalAcreedor: ["__col:8"],
  },
  enumMap: {},
  accountPrefixRules: {
    leafOnly: true,
    byPrefix: {
      "1": "Activo",
      "2": "Pasivo",
      "3": "Patrimonio",
      "4": "Ingreso",
      "5": "COGS",
      "6": "OpEx",
      "7": "Ingreso",
      "8": "OpEx",
    },
    nameExceptions: [
      { pattern: "costo de ventas|costo de venta|cogs", categoria: "COGS" as const },
      { pattern: "depreciacion|amortizacion", categoria: "OpEx" as const },
    ],
  },
  accountRoles: COMPAC_ACCOUNT_ROLES,
  matcherConfig: {
    requiredHeaders: ["cuenta", "nombre", "cargos", "abonos"],
    headerRowRange: [3, 12],
    tokens: ["balanza de comprobacion", "saldos iniciales", "saldos actuales"],
    minimumScore: 0.7,
    ambiguityMargin: 0.08,
    weights: { headers: 0.55, tokens: 0.35, headerRow: 0.1 },
  },
  partidaDobleMode: "full" as const,
  bridgeTesoreriaFromBalanza: false,
  flujoConfig: null,
};

export const MASTER_BALANZA_PROFILE: MappingProfileShape = {
  id: "builtin_master_template_balanza_v1",
  origin: "BUILTIN",
  tenantId: null,
  profileKey: "master_template/balanza",
  version: 1,
  isActive: true,
  fingerprintHash: "6cad6826c7c47bfd72a649502f71a0127bdada892ba47167b2019299e513441e2",
  name: "Plantilla máster / balanza",
  sourceSystem: "master_template" as const,
  documentType: "balanza" as const,
  headerRow: 1,
  sheetMatch: "balanza_pnl",
  columnMap: {
    idCuenta: ["id_cuenta"],
    nombreCuenta: ["nombre_cuenta"],
    categoriaMaestra: ["categoria_maestra"],
    saldoInicial: ["saldo_inicial"],
    debe: ["debe"],
    haber: ["haber"],
    saldoFinal: ["saldo_final"],
    montoPresupuestado: ["monto_presupuestado"],
    depreciacionAmortizacion: ["depreciacion_amortizacion"],
    periodo: ["periodo"],
    anio: ["anio", "ano"],
  },
  enumMap: {},
  accountPrefixRules: null,
  accountRoles: COMPAC_ACCOUNT_ROLES,
  matcherConfig: {
    requiredSheets: ["balanza_pnl", "auxiliar_ventas", "auxiliar_egresos", "tesoreria_flujo"],
    requiredHeaders: ["id_cuenta", "nombre_cuenta", "categoria_maestra", "debe", "haber"],
    headerRowRange: [1, 2],
    tokens: ["monto_presupuestado", "depreciacion_amortizacion"],
    minimumScore: 0.8,
    ambiguityMargin: 0.08,
    weights: { sheets: 0.5, headers: 0.4, tokens: 0.1 },
  },
  partidaDobleMode: "full" as const,
  bridgeTesoreriaFromBalanza: false,
  flujoConfig: null,
};

export const COMPAC_FLUJO_EFECTIVO_PROFILE: MappingProfileShape = {
  id: "builtin_compac_flujo_efectivo_v1",
  origin: "BUILTIN",
  tenantId: null,
  profileKey: "compac/flujo-efectivo",
  version: 1,
  isActive: true,
  fingerprintHash: "8f0e0696768754e564589d5d4f13a4bdaa25abc5eddf07369e64876d06ff54b6",
  name: "Compac / flujo de efectivo",
  sourceSystem: "compac" as const,
  documentType: "flujo_efectivo" as const,
  headerRow: 4,
  sheetMatch: "flujo de efectivo",
  columnMap: {
    concepto: ["__col:1", "concepto"],
    movimientos: ["__col:2", "movimientos"],
    saldos: ["__col:3", "saldos"],
  },
  enumMap: {},
  accountPrefixRules: null,
  accountRoles: null,
  matcherConfig: {
    requiredHeaders: ["movimientos", "saldos"],
    headerRowRange: [2, 10],
    tokens: ["flujo de efectivo", "disponible"],
    minimumScore: 0.7,
    ambiguityMargin: 0.08,
    weights: { headers: 0.45, tokens: 0.45, headerRow: 0.1 },
  },
  flujoConfig: {
    saldoInicial: ["saldo inicial"],
    ingresos: ["ingresos", "entradas"],
    totalIngresos: ["total ingresos", "total entradas"],
    disponible: ["disponible"],
    egresos: ["egresos", "salidas"],
    totalEgresos: ["total egresos", "total salidas"],
    saldoFinal: ["saldo final"],
    ingresoPrefix: ["ingr", "entrada"],
    egresoPrefix: ["egr", "salida"],
    traspaso: ["traspaso", "transfer", "entre cuentas"],
  },
  partidaDobleMode: "off" as const,
  bridgeTesoreriaFromBalanza: false,
};

export const COMPAC_AUXILIAR_PROFILE: MappingProfileShape = {
  id: "builtin_compac_auxiliar_v1",
  origin: "BUILTIN",
  tenantId: null,
  profileKey: "compac/auxiliar-cuentas",
  version: 1,
  isActive: true,
  fingerprintHash: "ff50ad91c21cbd05fa0e731516b094b425c682f1af9df2697af9a47a3924beb3",
  name: "Compac / auxiliar de cuentas (movimientos)",
  sourceSystem: "compac" as const,
  documentType: "auxiliar_cuentas" as const,
  headerRow: 7,
  sheetMatch: "reporte de compac",
  columnMap: {
    fecha: ["__col:1", "fecha"],
    tipoPoliza: ["__col:2", "tipo"],
    numeroPoliza: ["__col:3", "numero"],
    concepto: ["__col:4", "concepto"],
    referencia: ["__col:5", "referencia"],
    cargos: ["__col:6", "cargos"],
    abonos: ["__col:7", "abonos"],
    saldo: ["__col:8", "saldo"],
  },
  enumMap: {},
  accountPrefixRules: null,
  accountRoles: null,
  matcherConfig: {
    requiredHeaders: ["fecha", "tipo", "cargos", "abonos"],
    headerRowRange: [5, 9],
    tokens: ["auxiliares del catalogo", "saldo inicial"],
    minimumScore: 0.7,
    ambiguityMargin: 0.08,
    weights: { headers: 0.45, tokens: 0.45, headerRow: 0.1 },
  },
  partidaDobleMode: "off" as const,
  bridgeTesoreriaFromBalanza: false,
  flujoConfig: null,
};

export const COMPAC_POLIZAS_PROFILE: MappingProfileShape = {
  id: "builtin_compac_polizas_v1",
  origin: "BUILTIN",
  tenantId: null,
  profileKey: "compac/diarios-polizas",
  version: 1,
  isActive: true,
  fingerprintHash: "6aaff868434f1d65ea376cbd0fe88864cd9ebe7a7077e1d6cb33cb607b453899",
  name: "Compac / diarios y pólizas",
  sourceSystem: "compac" as const,
  documentType: "diarios_polizas" as const,
  headerRow: 6,
  sheetMatch: "diarios y polizas",
  // El impreso es auto-contenido (bloques por póliza); el parser no necesita
  // columnMap. Los headers fecha/tipo ya son marcadores globales, así que el
  // perfil no altera el fingerprint de otros reportes.
  columnMap: {},
  enumMap: {},
  accountPrefixRules: null,
  accountRoles: null,
  matcherConfig: {
    requiredSheets: ["diarios y polizas"],
    requiredHeaders: ["fecha", "tipo"],
    headerRowRange: [5, 9],
    tokens: ["impreso de polizas", "cifra de control"],
    minimumScore: 0.7,
    ambiguityMargin: 0.08,
    weights: { sheets: 0.15, headers: 0.3, tokens: 0.45, headerRow: 0.1 },
  },
  partidaDobleMode: "off" as const,
  bridgeTesoreriaFromBalanza: false,
  flujoConfig: null,
};

export const BUILTIN_PROFILES: MappingProfileShape[] = [
  MASTER_BALANZA_PROFILE,
  COMPAC_BALANZA_PROFILE,
  COMPAC_FLUJO_EFECTIVO_PROFILE,
  COMPAC_AUXILIAR_PROFILE,
  COMPAC_POLIZAS_PROFILE,
];
