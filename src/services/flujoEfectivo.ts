import { MONEY_TOLERANCE, nearlyEqual, round2 } from "@/services/money";

export type FlujoDireccion = "ingreso" | "egreso";

export type FlujoLinea = {
  categoriaKey: string;
  label: string;
  labelKey?: string;
  monto: number;
  esTraspaso: boolean;
};

export type FlujoEfectivoPeriodo = {
  empresa: string;
  cuenta: string;
  periodo: string;
  saldoInicial: number;
  ingresos: FlujoLinea[];
  totalIngresos: number;
  disponible: number;
  egresos: FlujoLinea[];
  totalEgresos: number;
  saldoFinal: number;
  traspasos: number;
};

const DIRECTION_PREFIX = /^(ingr|egr|entrada|salida)\b[.\s-]*/i;

export function slugCategoria(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  const withoutPrefix = trimmed.replace(DIRECTION_PREFIX, "");
  const base = withoutPrefix || trimmed;
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "categoria";
}

export type FlujoConciliacionInput = {
  saldoInicial: number;
  totalIngresos: number;
  disponible: number | null;
  totalEgresos: number;
  saldoFinal: number | null;
};

export function conciliarFlujo(
  input: FlujoConciliacionInput,
  tolerancia: number = MONEY_TOLERANCE,
): string[] {
  const warnings: string[] = [];
  const disponibleCalc = round2(input.saldoInicial + input.totalIngresos);
  if (input.disponible != null && !nearlyEqual(disponibleCalc, input.disponible, tolerancia)) {
    warnings.push(
      `Disponible no concilia: saldo inicial + ingresos = ${disponibleCalc.toFixed(2)}, reportado = ${input.disponible.toFixed(2)}.`,
    );
  }
  const disponibleBase = input.disponible ?? disponibleCalc;
  const saldoFinalCalc = round2(disponibleBase - input.totalEgresos);
  if (input.saldoFinal != null && !nearlyEqual(saldoFinalCalc, input.saldoFinal, tolerancia)) {
    warnings.push(
      `Saldo final no concilia: disponible - egresos = ${saldoFinalCalc.toFixed(2)}, reportado = ${input.saldoFinal.toFixed(2)}.`,
    );
  }
  return warnings;
}

export function sumTraspasos(lineas: FlujoLinea[]): number {
  return round2(
    lineas.filter((linea) => linea.esTraspaso).reduce((sum, linea) => sum + linea.monto, 0),
  );
}
