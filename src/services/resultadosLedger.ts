import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import { round2, toNumber } from "@/services/money";

export type ResultadosAccountBreakdown = {
  periodo: string;
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: "Ingreso" | "COGS" | "OpEx";
  amount: number;
  depreciacionAmortizacion: boolean;
};

export function buildResultadosSeries(rows: Array<{
  anio: number;
  periodo: number;
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  debe: unknown;
  haber: unknown;
  depreciacionAmortizacion: boolean;
}>): { series: MonthlyFinancials[]; breakdown: ResultadosAccountBreakdown[] } {
  const monthly = new Map<string, MonthlyFinancials>();
  const breakdown: ResultadosAccountBreakdown[] = [];
  for (const row of rows) {
    if (!["Ingreso", "COGS", "OpEx"].includes(row.categoriaMaestra)) continue;
    const periodo = `${row.anio}-${String(row.periodo).padStart(2, "0")}`;
    const amount = round2(
      row.categoriaMaestra === "Ingreso"
        ? toNumber(row.haber as number) - toNumber(row.debe as number)
        : toNumber(row.debe as number) - toNumber(row.haber as number),
    );
    const current = monthly.get(periodo) ?? {
      periodo,
      ingreso_total: 0,
      desglose_ingreso: {},
      micro_categorias: {},
      costo_total: 0,
      desglose_costo: {},
      gasto_total: 0,
      desglose_gasto: {},
      ebitda: 0,
      depreciacion_amortizacion: 0,
    };
    const target =
      row.categoriaMaestra === "Ingreso"
        ? current.desglose_ingreso
        : row.categoriaMaestra === "COGS"
          ? current.desglose_costo
          : current.desglose_gasto;
    target[row.nombreCuenta] = round2((target[row.nombreCuenta] ?? 0) + amount);
    if (row.categoriaMaestra === "Ingreso") current.ingreso_total = round2(current.ingreso_total + amount);
    if (row.categoriaMaestra === "COGS") current.costo_total = round2(current.costo_total + amount);
    if (row.categoriaMaestra === "OpEx") current.gasto_total = round2(current.gasto_total + amount);
    if (row.depreciacionAmortizacion) {
      current.depreciacion_amortizacion = round2((current.depreciacion_amortizacion ?? 0) + amount);
    }
    current.ebitda = round2(
      current.ingreso_total -
        current.costo_total -
        current.gasto_total +
        (current.depreciacion_amortizacion ?? 0),
    );
    monthly.set(periodo, current);
    breakdown.push({
      periodo,
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      categoriaMaestra: row.categoriaMaestra as ResultadosAccountBreakdown["categoriaMaestra"],
      amount,
      depreciacionAmortizacion: row.depreciacionAmortizacion,
    });
  }
  return {
    series: [...monthly.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)),
    breakdown,
  };
}
