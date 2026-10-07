import type { DestacadosRubro } from "@/services/financialDataTransformer";
import type { EstadoOperativoPayload } from "@/services/estadoOperativoService";
import { round2 } from "@/services/money";

export function shiftPeriodo(periodo: string, deltaMonths: number): string {
  const [year, month] = periodo.split("-").map(Number);
  if (!year || !month) return periodo;
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function comparableShift(contextLabel: string | null): number | null {
  if (contextLabel === "vs mes anterior") return -1;
  if (contextLabel === "vs año anterior") return -12;
  if (contextLabel === "vs trimestre anterior") return -3;
  return null;
}

function utilidadNetaMonto(
  data: EstadoOperativoPayload | null | undefined,
  column: "mesActual" | "mesAnterior",
): number | null {
  if (!data) return null;
  if (column === "mesActual" && !data.hasPnl) return null;
  const row = data.filas.find((fila) => fila.key === "utilidadNeta");
  return row?.[column].monto ?? null;
}

function deltaPct(actual: number | null, prior: number | null): number | null {
  if (actual == null || prior == null || Math.abs(prior) < 0.01) return null;
  return round2(((actual - prior) / Math.abs(prior)) * 100);
}

/** Misma utilidad neta que la tarjeta de Estado de resultados. */
export function buildUtilidadRubro(
  estadoActual: EstadoOperativoPayload | null | undefined,
  estadoPrior: EstadoOperativoPayload | null | undefined,
  contextLabel: string | null,
): DestacadosRubro {
  const actual = utilidadNetaMonto(estadoActual, "mesActual");
  const prior =
    contextLabel === "vs mes anterior"
      ? utilidadNetaMonto(estadoActual, "mesAnterior")
      : contextLabel
        ? utilidadNetaMonto(estadoPrior, "mesActual")
        : null;
  return {
    key: "utilidad",
    title: "Utilidad",
    value: actual,
    deltaPct: deltaPct(actual, prior),
    inverted: false,
  };
}
