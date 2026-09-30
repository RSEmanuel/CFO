import { classifyErCuenta, computeErBuckets } from "@/services/estadoOperativo";
import { buildGastoOpexGrupos, normalizeCuentaNombre, type GastoOpexRow } from "@/services/gastoOpex";
import { round2 } from "@/services/money";

/**
 * Treemap jerárquico del OPEX del mes (tab Gasto).
 *
 * Jerarquía: Gastos Operativos → bucket canónico → subcuentas hoja.
 * Buckets (mismo split que `opexCommercialSplit`, p. ej. jul-2026: 93.5/2.1/4.4):
 * - venta: prefijo 6101 (`gastosVenta`)
 * - admin: prefijo 6201 (`gastosAdmin`)
 * - otros: 6301 D&A contable (`daContable`) + demás 6xxx (`otrosOperativos`);
 *   NUNCA 6405 PTU / 6406 ISR / 8101 (fuera del universo OPEX).
 *
 * Materialidad: dentro de cada bucket, las subcuentas < 1% del OPEX total se
 * agrupan en una hoja "Otros gastos menores" (por bucket, para que
 * Σ hojas = bucket y Σ buckets = totalOpex canónico). Contra-asientos
 * negativos caen en ese pliegue; si el pliegue neto es ≤ 0 se omite la hoja
 * (el treemap no puede dibujar áreas negativas).
 *
 * ΔMoM: (monto − mesAnterior) / mesAnterior × 100 sobre la MISMA cuenta;
 * null cuando no hay balanza previa o la cuenta estaba en ~0 (no se inventa
 * el signo). Para "Otros gastos menores" el comparativo es la suma del mes
 * anterior de las mismas cuentas plegadas este mes.
 */

export type OpexTreemapBucket = "venta" | "admin" | "otros";

/** Umbral de materialidad: subcuentas < 1% del OPEX total se pliegan. */
export const TREEMAP_MIN_SHARE = 0.01;

/**
 * Nombres crudos CONTPAQi (truncados a ~30 chars) → etiquetas legibles.
 * La llave va normalizada (minúsculas, sin acentos, espacios colapsados) para
 * tolerar variantes de captura; lo no mapeado se muestra tal cual viene.
 */
const OPEX_ETIQUETAS_LIMPIAS: Record<string, string> = {
  "gtos no ded (sin requisito fis": "Gastos No Deducibles",
  "honorarios pf res nal": "Honorarios Personas Físicas",
  "honorarios pm res nac": "Honorarios Personas Morales",
  "arrendamiento pm res nac": "Arrendamiento a Personas Morales",
  "papeleria y articulos de ofici": "Papelería y Artículos de Oficina",
};

export function cleanOpexCuentaNombre(nombre: string): string {
  const etiqueta = OPEX_ETIQUETAS_LIMPIAS[normalizeCuentaNombre(nombre)];
  return etiqueta ?? nombre.trim();
}

const ZERO = 0.005;

export type OpexTreemapLeaf = {
  /** null solo en la hoja agregada "Otros gastos menores" (sin drill-down). */
  idCuenta: string | null;
  nombreCuenta: string;
  monto: number;
  /** % del OPEX total del mes (1 decimal). */
  pctTotal: number;
  /** Δ% vs mes anterior; null = sin comparable. */
  deltaMomPct: number | null;
  esOtrosMenores: boolean;
};

export type OpexTreemapBucketNode = {
  bucket: OpexTreemapBucket;
  monto: number;
  pctTotal: number;
  deltaMomPct: number | null;
  leaves: OpexTreemapLeaf[];
};

export type GastoOpexTreemap = {
  totalOpex: number;
  /** Periodo "YYYY-MM" del comparativo MoM; null si no hay balanza previa. */
  periodoAnterior: string | null;
  buckets: OpexTreemapBucketNode[];
};

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function bucketOf(idCuenta: string): OpexTreemapBucket | null {
  const clase = classifyErCuenta(idCuenta);
  if (clase === "gastosVenta") return "venta";
  if (clase === "gastosAdmin") return "admin";
  if (clase === "daContable" || clase === "otrosOperativos") return "otros";
  return null;
}

function deltaPct(actual: number, prior: number | undefined): number | null {
  if (prior == null || prior <= ZERO) {
    return null;
  }
  return round1(((actual - prior) / prior) * 100);
}

/**
 * Construye el árbol del treemap. `anterior` = filas crudas del mes anterior
 * (null cuando no hay balanza previa → todos los ΔMoM en null).
 */
export function buildGastoOpexTreemap(
  actual: GastoOpexRow[],
  anterior: GastoOpexRow[] | null,
  periodoAnterior: string | null = null,
): GastoOpexTreemap {
  const totalOpex = computeErBuckets(actual).totalOpex;
  if (totalOpex <= ZERO) {
    return { totalOpex, periodoAnterior: null, buckets: [] };
  }

  const { grupos } = buildGastoOpexGrupos(actual);
  const priorMap = new Map<string, number>();
  if (anterior && anterior.length > 0) {
    for (const grupo of buildGastoOpexGrupos(anterior).grupos) {
      priorMap.set(grupo.key, grupo.monto);
    }
  }
  const hasPrior = anterior != null && anterior.length > 0;

  const byBucket = new Map<OpexTreemapBucket, typeof grupos>();
  for (const grupo of grupos) {
    const bucket = bucketOf(grupo.key);
    if (!bucket) {
      continue;
    }
    const list = byBucket.get(bucket) ?? [];
    list.push(grupo);
    byBucket.set(bucket, list);
  }

  const minMonto = totalOpex * TREEMAP_MIN_SHARE;
  const buckets: OpexTreemapBucketNode[] = [];
  for (const bucket of ["venta", "admin", "otros"] as const) {
    const cuentas = byBucket.get(bucket) ?? [];
    const bucketTotal = round2(cuentas.reduce((sum, cuenta) => sum + cuenta.monto, 0));
    // Un bucket neto ≤ 0 (p. ej. puro contra-asiento) no tiene área dibujable.
    if (bucketTotal <= ZERO) {
      continue;
    }
    const priorBucketTotal = hasPrior
      ? round2(cuentas.reduce((sum, cuenta) => sum + (priorMap.get(cuenta.key) ?? 0), 0))
      : null;

    const visibles = cuentas.filter((cuenta) => cuenta.monto >= minMonto && cuenta.monto > ZERO);
    const plegadas = cuentas.filter((cuenta) => !(cuenta.monto >= minMonto && cuenta.monto > ZERO));

    const leaves: OpexTreemapLeaf[] = visibles.map((cuenta) => ({
      idCuenta: cuenta.key,
      nombreCuenta: cuenta.label,
      monto: cuenta.monto,
      pctTotal: round1((cuenta.monto / totalOpex) * 100),
      deltaMomPct: hasPrior ? deltaPct(cuenta.monto, priorMap.get(cuenta.key)) : null,
      esOtrosMenores: false,
    }));

    if (plegadas.length > 0) {
      const montoMenores = round2(plegadas.reduce((sum, cuenta) => sum + cuenta.monto, 0));
      if (montoMenores > ZERO) {
        const priorMenores = hasPrior
          ? round2(plegadas.reduce((sum, cuenta) => sum + (priorMap.get(cuenta.key) ?? 0), 0))
          : null;
        leaves.push({
          idCuenta: null,
          nombreCuenta: "",
          monto: montoMenores,
          pctTotal: round1((montoMenores / totalOpex) * 100),
          deltaMomPct: priorMenores != null ? deltaPct(montoMenores, priorMenores) : null,
          esOtrosMenores: true,
        });
      }
    }

    buckets.push({
      bucket,
      monto: bucketTotal,
      pctTotal: round1((bucketTotal / totalOpex) * 100),
      deltaMomPct: priorBucketTotal != null ? deltaPct(bucketTotal, priorBucketTotal) : null,
      leaves,
    });
  }

  return { totalOpex, periodoAnterior: hasPrior ? periodoAnterior : null, buckets };
}
