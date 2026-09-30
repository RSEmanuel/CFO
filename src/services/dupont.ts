import { safeRatio } from "@/services/metricsLedger";
import type { PeriodSnapshot } from "@/services/financialSnapshot";
import { nearlyEqual, round2 } from "@/services/money";

/**
 * Descomposición DuPont del ROE, en paridad con el catálogo 50-métricas.
 *
 * Base temporal: **mensual del periodo de cierre** — la misma que
 * `getMetricsCatalog` / `snapshotFromLoaded` (`balanzaMes`). No anualiza
 * (el catálogo #11 tampoco) y no usa YTD: en jul-2026 el mes es utilidad y
 * el YTD es pérdida; mezclar bases rompería la identidad y la paridad.
 *
 * Definiciones (idénticas al motor):
 * - Margen neto (#3)  = utilidadNeta / ventas × 100          (`pctOf`)
 * - Rotación (#16)    = ventas / activoTotal                 (`safeRatio`)
 * - Apalancamiento (#36) = activoTotal / capital NIF         (`safeRatio`)
 * - ROE (#11)         = utilidadNeta / capital NIF × 100     (`pctOf`)
 * - ROA (#12)         = utilidadNeta / activoTotal × 100     (paso intermedio)
 *
 * Denominador del ROE: **capital contable NIF** = cuentas 3xxx + resultado
 * del ejercicio YTD con signo económico (`structureFromBalanza.patrimonioNif`,
 * la misma línea «capital + resultado» del árbol B3). Ventas y utilidad neta
 * son las canónicas del ER Operativo (vía `buildPeriodSnapshot`).
 *
 * Déficit patrimonial (capital NIF ≤ 0): el ROE y el apalancamiento NO son
 * significativos → null (la UI muestra la nota de déficit en vez de un ratio
 * con signo invertido). Margen neto, rotación y ROA siguen computando porque
 * no dependen del capital.
 *
 * Identidad: en razones crudas (sin redondeo)
 *   (NI/S) × (S/A) × (A/E) = NI/E
 * al centavo del producto vs NI/E (tolerancia flotante 1e-9 sobre la razón).
 * Los factores *mostrados* se redondean como el catálogo; su producto puede
 * desviarse del ROE redondeado hasta `DUPONT_ROUNDED_IDENTITY_TOLERANCE_PP`
 * puntos porcentuales.
 *
 * División por cero: `abs(denominador) < 0.01` → null (`safeRatio` / `pctOf`).
 */

/** Umbral de denominador, idéntico a `safeRatio` / `pctOf`. */
export const DUPONT_ZERO_DENOM = 0.01;

/**
 * Desvío máximo aceptable (puntos porcentuales) entre el producto de los
 * tres factores ya redondeados y el ROE redondeado. Un redondeo a 2 decimales
 * en cada factor (p.ej. 1.333… → 1.33x) puede mover ~0.10 pp.
 */
export const DUPONT_ROUNDED_IDENTITY_TOLERANCE_PP = 0.15;

export const DUPONT_ASSUMPTIONS: string[] = [
  "DuPont usa la base mensual del periodo activo, igual que el catálogo #11 ROE: no anualiza ni sustituye el mes por YTD.",
  "Ventas y utilidad neta son las canónicas del ER Operativo (computeErBuckets vía buildPeriodSnapshot): ventas netas sin productos financieros y neta formal después de RIF, PTU e ISR.",
  "El denominador del ROE es el capital contable NIF: cuentas 3xxx + resultado del ejercicio YTD con signo económico (la misma cifra «capital + resultado» del árbol EPF/B3).",
  "Con déficit patrimonial (capital NIF ≤ 0) el ROE y el apalancamiento no son significativos y se muestran N/D; margen neto, rotación y ROA sí se reportan.",
  "La identidad exacta se verifica en razones crudas. El producto de factores redondeados puede diferir del ROE hasta 0.15 pp.",
];

export type DupontInputs = {
  ventas: number;
  utilidadNeta: number;
  activoTotal: number;
  capitalContable: number;
};

export type DupontFactors = {
  /** #3, porcentaje. */
  margenNeto: number | null;
  /** #16, veces. */
  rotacionActivos: number | null;
  /** #36, veces. */
  apalancamiento: number | null;
  /** #12, porcentaje (margen × rotación). */
  roa: number | null;
  /** #11, porcentaje. */
  roe: number | null;
  /** (margen/100) × rotación × apalancamiento × 100, con factores redondeados. */
  productoRedondeado: number | null;
  /** Identidad cruda (NI/S)×(S/A)×(A/E) ≡ NI/E. */
  identidadCruda: boolean;
};

function pctOf(numerator: number, denominator: number): number | null {
  if (Math.abs(denominator) < DUPONT_ZERO_DENOM) {
    return null;
  }
  return round2((numerator / denominator) * 100);
}

export function buildDupont(input: DupontInputs): DupontFactors {
  const { ventas, utilidadNeta, activoTotal, capitalContable } = input;

  const margenNeto = pctOf(utilidadNeta, ventas);
  const rotacionActivos = safeRatio(ventas, activoTotal);
  const roa = pctOf(utilidadNeta, activoTotal);
  // Capital NIF ≤ 0 (déficit patrimonial): apalancamiento y ROE no son
  // significativos (el signo invertido produciría ratios engañosos) → null.
  const capitalSignificativo = capitalContable > DUPONT_ZERO_DENOM;
  const apalancamiento = capitalSignificativo ? safeRatio(activoTotal, capitalContable) : null;
  const roe = capitalSignificativo ? pctOf(utilidadNeta, capitalContable) : null;

  const canMultiply =
    Math.abs(ventas) >= DUPONT_ZERO_DENOM &&
    Math.abs(activoTotal) >= DUPONT_ZERO_DENOM &&
    capitalSignificativo;

  const identidadCruda = canMultiply
    ? nearlyEqual(
        (utilidadNeta / ventas) * (ventas / activoTotal) * (activoTotal / capitalContable),
        utilidadNeta / capitalContable,
        1e-9,
      )
    : false;

  const productoRedondeado =
    margenNeto != null && rotacionActivos != null && apalancamiento != null
      ? round2((margenNeto / 100) * rotacionActivos * apalancamiento * 100)
      : null;

  return {
    margenNeto,
    rotacionActivos,
    apalancamiento,
    roa,
    roe,
    productoRedondeado,
    identidadCruda,
  };
}

/** Insumos del snapshot de catálogo → DuPont (paridad #3/#11/#12/#16/#36). */
export function dupontFromSnapshot(snapshot: PeriodSnapshot): DupontFactors {
  return buildDupont({
    ventas: snapshot.ingresos,
    utilidadNeta: snapshot.utilidadNeta,
    activoTotal: snapshot.activoTotal,
    capitalContable: snapshot.patrimonio,
  });
}

export function roundedIdentityHolds(factors: DupontFactors): boolean {
  if (factors.roe == null || factors.productoRedondeado == null) {
    return false;
  }
  return Math.abs(factors.productoRedondeado - factors.roe) <= DUPONT_ROUNDED_IDENTITY_TOLERANCE_PP;
}
