import { isDepreciation } from "@/services/ingest/accountClassify";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { round2 } from "@/services/money";

/**
 * Estado de Resultados Operativo formal.
 *
 * Clasificación PROPIA por primer segmento del idCuenta (no reutiliza
 * categoriaMaestra ni los clasificadores de metricsLedger/financialSnapshot):
 * - 4xxx ventas (haber − debe; las devoluciones 4201 entran como contracuenta)
 * - 5xxx costo de ventas (debe − haber)
 * - 6101/6201/6301 OpEx; 6405 PTU y 6406 ISR son IMPUESTOS, no OpEx
 * - 7102/7104 productos financieros (haber − debe); 8101 gastos financieros (debe − haber)
 *
 * Convención D&A (para no duplicar): las cuentas de depreciación/amortización
 * que viven dentro de 6101/6201 se muestran DENTRO de su subtotal de gasto y
 * solo se reintegran en el paso EBITDA. La D&A del reintegro = todo 6301 +
 * cuentas PyG de 6101/6201 cuyo nombre dice depreciación/amortización. Las
 * cuentas de balance 1200/1202 (dep. acumulada) nunca entran: el clasificador
 * solo asigna buckets a primer segmento 4-8.
 *
 * Sin doble deducción: 8101 NO forma parte del OpEx; entra una sola vez vía
 * RIF = productos − gastos financieros, y EBT = EBIT + RIF.
 */

export const ER_PREFIXES = {
  ventas: ["4"],
  costo: ["5"],
  gastosVenta: ["6101"],
  gastosAdmin: ["6201"],
  daContable: ["6301"],
  ptu: ["6405"],
  isr: ["6406"],
  productosFinancieros: ["7102", "7104"],
  gastosFinancieros: ["8101"],
} as const;

// Catch-alls por primer dígito: ninguna cuenta de PyG queda fuera del cuadre
// (Utilidad Neta = Ventas − Costo − OPEX + RIF − Impuestos) aunque el catálogo
// tenga 6xxx/7xxx/8xxx no listados en ER_PREFIXES.
export const ER_CATCHALL = {
  otrosOperativos: "6",
  productosFinancieros: "7",
  gastosFinancieros: "8",
} as const;

export type ErClasificacion =
  | "ventas"
  | "costo"
  | "gastosVenta"
  | "gastosAdmin"
  | "daContable"
  | "otrosOperativos"
  | "ptu"
  | "isr"
  | "productosFinancieros"
  | "gastosFinancieros";

/** null = cuenta de balance (1xxx/2xxx/3xxx) o fuera del PyG: se ignora. */
export function classifyErCuenta(idCuenta: string): ErClasificacion | null {
  const firstSegment = idCuenta.trim().split(/[-.]/).filter((segment) => segment.length > 0)[0] ?? "";
  if (!firstSegment) {
    return null;
  }
  const match = (prefixes: readonly string[]) => prefixes.some((prefix) => firstSegment.startsWith(prefix));
  // Específicos de 6xxx primero; el catch-all "6" va al final.
  if (match(ER_PREFIXES.ptu)) return "ptu";
  if (match(ER_PREFIXES.isr)) return "isr";
  if (match(ER_PREFIXES.gastosVenta)) return "gastosVenta";
  if (match(ER_PREFIXES.gastosAdmin)) return "gastosAdmin";
  if (match(ER_PREFIXES.daContable)) return "daContable";
  if (match(ER_PREFIXES.ventas)) return "ventas";
  if (match(ER_PREFIXES.costo)) return "costo";
  if (match(ER_PREFIXES.productosFinancieros)) return "productosFinancieros";
  if (match(ER_PREFIXES.gastosFinancieros)) return "gastosFinancieros";
  if (firstSegment.startsWith(ER_CATCHALL.otrosOperativos)) return "otrosOperativos";
  if (firstSegment.startsWith(ER_CATCHALL.productosFinancieros)) return "productosFinancieros";
  if (firstSegment.startsWith(ER_CATCHALL.gastosFinancieros)) return "gastosFinancieros";
  return null;
}

/** Universo OPEX del ER: venta + admin + D&A 6301 + otros 6xxx (sin PTU/ISR ni 8xxx). */
export function isErOpexCuenta(idCuenta: string): boolean {
  const clase = classifyErCuenta(idCuenta);
  return clase === "gastosVenta" || clase === "gastosAdmin" || clase === "daContable" || clase === "otrosOperativos";
}

export type ErCuentaRow = {
  idCuenta: string;
  nombreCuenta: string;
  debe: number;
  haber: number;
};

export type ErRowKey =
  | "ventas"
  | "costo"
  | "utilidadBruta"
  | "gastosVenta"
  | "gastosAdmin"
  | "daContable"
  | "otrosOperativos"
  | "totalOpex"
  | "ebit"
  | "daReintegro"
  | "ebitda"
  | "rif"
  | "productosFinancieros"
  | "gastosFinancieros"
  | "ebt"
  | "ptu"
  | "isr"
  | "utilidadNeta";

export type ErRowRole = "base" | "item" | "sub" | "total" | "result";

export type ErCell = {
  monto: number | null;
  pct: number | null;
};

export type ErRow = {
  key: ErRowKey;
  role: ErRowRole;
  level: number;
  invertDelta: boolean;
  acumulado: ErCell;
  mesActual: ErCell;
  mesAnterior: ErCell;
  variacionMonto: number | null;
  variacionPp: number | null;
};

export type EstadoOperativo = {
  filas: ErRow[];
  hasPnl: boolean;
};

/**
 * Buckets del ER formal. Es la ÚNICA aritmética canónica del PyG: el snapshot
 * del catálogo (`buildPeriodSnapshot`) la consume vía `computeErBuckets` en
 * vez de recomputar con su propia clasificación.
 */
export type ErBuckets = {
  ventas: number;
  costo: number;
  utilidadBruta: number;
  gastosVenta: number;
  gastosAdmin: number;
  daContable: number;
  otrosOperativos: number;
  totalOpex: number;
  ebit: number;
  da: number;
  ebitda: number;
  productosFinancieros: number;
  gastosFinancieros: number;
  rif: number;
  ebt: number;
  ptu: number;
  isr: number;
  utilidadNeta: number;
};

function pct(parte: number, ventas: number): number | null {
  return Math.abs(ventas) > 0.005 ? round2((parte / ventas) * 100) : null;
}

/**
 * Suma un periodo (mes o YTD) en buckets del ER formal. Agrega por cuenta,
 * descarta padres (selectLeafCodes) y clasifica por prefijo 4xxx–8xxx.
 * Fuente única de la utilidad neta canónica (catálogo y ER Operativo).
 */
export function computeErBuckets(rows: ErCuentaRow[]): ErBuckets {
  const byCuenta = new Map<string, { idCuenta: string; nombreCuenta: string; debe: number; haber: number }>();
  for (const row of rows) {
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      debe: 0,
      haber: 0,
    };
    acc.debe += row.debe;
    acc.haber += row.haber;
    byCuenta.set(row.idCuenta, acc);
  }
  const leafSet = selectLeafCodes([...byCuenta.keys()]);

  let ventas = 0;
  let costo = 0;
  let gastosVenta = 0;
  let gastosAdmin = 0;
  let daContable = 0;
  let otrosOperativos = 0;
  let ptu = 0;
  let isr = 0;
  let productosFinancieros = 0;
  let gastosFinancieros = 0;
  let daInterna = 0;

  for (const cuenta of byCuenta.values()) {
    if (!leafSet.has(cuenta.idCuenta)) {
      continue;
    }
    const clase = classifyErCuenta(cuenta.idCuenta);
    if (!clase) {
      continue;
    }
    const gasto = cuenta.debe - cuenta.haber;
    switch (clase) {
      case "ventas":
        ventas += cuenta.haber - cuenta.debe;
        break;
      case "costo":
        costo += gasto;
        break;
      case "gastosVenta":
        gastosVenta += gasto;
        if (isDepreciation(cuenta.nombreCuenta, cuenta.idCuenta)) daInterna += gasto;
        break;
      case "gastosAdmin":
        gastosAdmin += gasto;
        if (isDepreciation(cuenta.nombreCuenta, cuenta.idCuenta)) daInterna += gasto;
        break;
      case "daContable":
        daContable += gasto;
        break;
      case "otrosOperativos":
        otrosOperativos += gasto;
        break;
      case "ptu":
        ptu += gasto;
        break;
      case "isr":
        isr += gasto;
        break;
      case "productosFinancieros":
        productosFinancieros += cuenta.haber - cuenta.debe;
        break;
      case "gastosFinancieros":
        gastosFinancieros += gasto;
        break;
    }
  }

  const utilidadBruta = round2(ventas - costo);
  const totalOpex = round2(gastosVenta + gastosAdmin + daContable + otrosOperativos);
  const ebit = round2(utilidadBruta - totalOpex);
  const da = round2(daContable + daInterna);
  const ebitda = round2(ebit + da);
  const rif = round2(productosFinancieros - gastosFinancieros);
  const ebt = round2(ebit + rif);
  const utilidadNeta = round2(ebt - ptu - isr);

  return {
    ventas: round2(ventas),
    costo: round2(costo),
    utilidadBruta,
    gastosVenta: round2(gastosVenta),
    gastosAdmin: round2(gastosAdmin),
    daContable: round2(daContable),
    otrosOperativos: round2(otrosOperativos),
    totalOpex,
    ebit,
    da,
    ebitda,
    productosFinancieros: round2(productosFinancieros),
    gastosFinancieros: round2(gastosFinancieros),
    rif,
    ebt,
    ptu: round2(ptu),
    isr: round2(isr),
    utilidadNeta,
  };
}

const ER_SPECS: Array<{
  key: ErRowKey;
  role: ErRowRole;
  level: number;
  invertDelta: boolean;
  pick: (b: ErBuckets) => number;
}> = [
  { key: "ventas", role: "base", level: 0, invertDelta: true, pick: (b) => b.ventas },
  { key: "costo", role: "item", level: 0, invertDelta: false, pick: (b) => b.costo },
  { key: "utilidadBruta", role: "result", level: 0, invertDelta: true, pick: (b) => b.utilidadBruta },
  { key: "gastosVenta", role: "item", level: 0, invertDelta: false, pick: (b) => b.gastosVenta },
  { key: "gastosAdmin", role: "item", level: 0, invertDelta: false, pick: (b) => b.gastosAdmin },
  { key: "daContable", role: "item", level: 0, invertDelta: false, pick: (b) => b.daContable },
  { key: "otrosOperativos", role: "item", level: 0, invertDelta: false, pick: (b) => b.otrosOperativos },
  { key: "totalOpex", role: "total", level: 0, invertDelta: false, pick: (b) => b.totalOpex },
  { key: "ebit", role: "result", level: 0, invertDelta: true, pick: (b) => b.ebit },
  { key: "daReintegro", role: "sub", level: 1, invertDelta: true, pick: (b) => b.da },
  { key: "ebitda", role: "result", level: 0, invertDelta: true, pick: (b) => b.ebitda },
  { key: "rif", role: "total", level: 0, invertDelta: true, pick: (b) => b.rif },
  { key: "productosFinancieros", role: "sub", level: 1, invertDelta: true, pick: (b) => b.productosFinancieros },
  { key: "gastosFinancieros", role: "sub", level: 1, invertDelta: false, pick: (b) => b.gastosFinancieros },
  { key: "ebt", role: "result", level: 0, invertDelta: true, pick: (b) => b.ebt },
  { key: "ptu", role: "sub", level: 1, invertDelta: false, pick: (b) => b.ptu },
  { key: "isr", role: "sub", level: 1, invertDelta: false, pick: (b) => b.isr },
  { key: "utilidadNeta", role: "result", level: 0, invertDelta: true, pick: (b) => b.utilidadNeta },
];

function delta(actual: number | null, prior: number | null): number | null {
  if (actual == null || prior == null) {
    return null;
  }
  return round2(actual - prior);
}

export function buildEstadoOperativo(input: {
  acumulado: ErCuentaRow[];
  mesActual: ErCuentaRow[];
  mesAnterior: ErCuentaRow[];
}): EstadoOperativo {
  const ytd = computeErBuckets(input.acumulado);
  const actual = computeErBuckets(input.mesActual);
  // Sin balanza del mes anterior (p.ej. primer corte del tenant) la columna y
  // las variaciones quedan en null → la UI muestra "N/A" en vez de $0.00 con
  // una variación ficticia del 100% del mes.
  const hasPrior = input.mesAnterior.length > 0;
  const prior = hasPrior ? computeErBuckets(input.mesAnterior) : null;

  const filas: ErRow[] = ER_SPECS.map((spec) => {
    const cell = (b: ErBuckets): ErCell => ({ monto: round2(spec.pick(b)), pct: pct(spec.pick(b), b.ventas) });
    const acumulado = cell(ytd);
    const mesActual = cell(actual);
    const mesAnterior: ErCell = prior ? cell(prior) : { monto: null, pct: null };
    return {
      key: spec.key,
      role: spec.role,
      level: spec.level,
      invertDelta: spec.invertDelta,
      acumulado,
      mesActual,
      mesAnterior,
      variacionMonto: delta(mesActual.monto, mesAnterior.monto),
      variacionPp: delta(mesActual.pct, mesAnterior.pct),
    };
  });

  return { filas, hasPnl: input.mesActual.length > 0 };
}
