import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import { classifyErCuenta, computeErBuckets, type ErClasificacion } from "@/services/estadoOperativo";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { round2, toNumber } from "@/services/money";

export type ResultadosAccountBreakdown = {
  periodo: string;
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: "Ingreso" | "COGS" | "OpEx";
  amount: number;
  depreciacionAmortizacion: boolean;
};

type ResultadosRow = {
  anio: number;
  periodo: number;
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  debe: unknown;
  haber: unknown;
  depreciacionAmortizacion: boolean;
};

/**
 * Rubro de Resultados para cada clase del PyG oficial. Productos y gastos
 * financieros (7xxx, 8xxx), PTU e ISR no son ingreso ni gasto de operación:
 * quedan fuera de las tarjetas, igual que en `computeErBuckets`.
 */
const RUBRO: Partial<Record<ErClasificacion, ResultadosAccountBreakdown["categoriaMaestra"]>> = {
  ventas: "Ingreso",
  costo: "COGS",
  gastosVenta: "OpEx",
  gastosAdmin: "OpEx",
  daContable: "OpEx",
  otrosOperativos: "OpEx",
};

/**
 * Serie mensual de Resultados. Los totales de cada mes (ingreso, costo, gasto,
 * D&A y EBITDA) son los de `computeErBuckets`, para que las tarjetas, la
 * tendencia y el paquete del mes digan lo mismo que el Estado de resultados.
 * El desglose por cuenta usa la misma clasificación y las mismas cuentas hoja,
 * así que siempre suma el total de su rubro.
 */
export function buildResultadosSeries(rows: ResultadosRow[]): {
  series: MonthlyFinancials[];
  breakdown: ResultadosAccountBreakdown[];
} {
  const rowsByPeriodo = new Map<string, ResultadosRow[]>();
  for (const row of rows) {
    const periodo = `${row.anio}-${String(row.periodo).padStart(2, "0")}`;
    const list = rowsByPeriodo.get(periodo) ?? [];
    list.push(row);
    rowsByPeriodo.set(periodo, list);
  }

  const series: MonthlyFinancials[] = [];
  const breakdown: ResultadosAccountBreakdown[] = [];
  for (const [periodo, monthRows] of rowsByPeriodo) {
    const er = computeErBuckets(
      monthRows.map((row) => ({
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        debe: toNumber(row.debe as number),
        haber: toNumber(row.haber as number),
      })),
    );
    const leaves = selectLeafCodes(monthRows.map((row) => row.idCuenta));
    const current: MonthlyFinancials = {
      periodo,
      ingreso_total: er.ventas,
      desglose_ingreso: {},
      micro_categorias: {},
      costo_total: er.costo,
      desglose_costo: {},
      gasto_total: er.totalOpex,
      desglose_gasto: {},
      ebitda: er.ebitda,
      depreciacion_amortizacion: er.da,
    };
    for (const row of monthRows) {
      const clase = classifyErCuenta(row.idCuenta);
      const rubro = clase ? RUBRO[clase] : undefined;
      if (!rubro || !leaves.has(row.idCuenta)) continue;
      const amount = round2(
        rubro === "Ingreso"
          ? toNumber(row.haber as number) - toNumber(row.debe as number)
          : toNumber(row.debe as number) - toNumber(row.haber as number),
      );
      const target =
        rubro === "Ingreso" ? current.desglose_ingreso : rubro === "COGS" ? current.desglose_costo : current.desglose_gasto;
      target[row.nombreCuenta] = round2((target[row.nombreCuenta] ?? 0) + amount);
      breakdown.push({
        periodo,
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        categoriaMaestra: rubro,
        amount,
        depreciacionAmortizacion: row.depreciacionAmortizacion,
      });
    }
    series.push(current);
  }

  return {
    series: series.sort((a, b) => a.periodo.localeCompare(b.periodo)),
    breakdown,
  };
}
