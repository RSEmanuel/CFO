import { computeErBuckets, type ErCuentaRow } from "@/services/estadoOperativo";
import { round2 } from "@/services/money";

/**
 * Serie TTM EBIT vs EBITDA para el tab Estado Operativo.
 *
 * Cada punto del trailing-twelve-months se calcula con los buckets canónicos
 * del ER (`computeErBuckets`): EBIT = ventas − costo − OPEX; D&A = bucket
 * depreciacion (6301 + D&A interna de 6101/6201); EBITDA = EBIT + D&A. Así la
 * gráfica cuadra al centavo con la tabla del Estado Operativo del mismo mes.
 */

export type EbitdaTtmPoint = {
  /** "2025-08" */
  periodo: string;
  anio: number;
  /** 1-12 */
  mes: number;
  ventas: number;
  ebit: number;
  da: number;
  ebitda: number;
  /** ebitda / ventas × 100; null si el mes no tiene ventas. */
  margenEbitda: number | null;
  /** false cuando el mes no tiene balanza (hueco en la serie). */
  hasData: boolean;
};

export type EbitdaTtmRow = ErCuentaRow & { anio: number; periodo: number };

function padPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Ventana de 12 meses que termina en `target` (inclusive), orden ascendente. */
export function ttmWindow(target: { anio: number; mes: number }): Array<{ anio: number; mes: number }> {
  const out: Array<{ anio: number; mes: number }> = [];
  let anio = target.anio;
  let mes = target.mes;
  for (let index = 0; index < 12; index += 1) {
    out.unshift({ anio, mes });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return out;
}

export function buildEbitdaTtm(
  rows: EbitdaTtmRow[],
  target: { anio: number; mes: number },
): EbitdaTtmPoint[] {
  const byPeriod = new Map<string, ErCuentaRow[]>();
  for (const row of rows) {
    const key = padPeriodo(row.anio, row.periodo);
    const list = byPeriod.get(key);
    if (list) {
      list.push(row);
    } else {
      byPeriod.set(key, [row]);
    }
  }

  return ttmWindow(target).map(({ anio, mes }) => {
    const periodo = padPeriodo(anio, mes);
    const monthRows = byPeriod.get(periodo) ?? [];
    if (monthRows.length === 0) {
      return {
        periodo,
        anio,
        mes,
        ventas: 0,
        ebit: 0,
        da: 0,
        ebitda: 0,
        margenEbitda: null,
        hasData: false,
      };
    }
    const buckets = computeErBuckets(monthRows);
    return {
      periodo,
      anio,
      mes,
      ventas: buckets.ventas,
      ebit: buckets.ebit,
      da: buckets.da,
      ebitda: buckets.ebitda,
      margenEbitda:
        Math.abs(buckets.ventas) > 0.005 ? round2((buckets.ebitda / buckets.ventas) * 100) : null,
      hasData: true,
    };
  });
}
