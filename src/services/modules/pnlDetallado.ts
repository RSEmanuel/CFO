import type { AuxiliarEgresos } from "@/generated/prisma/client";
import type { CentroCostoLine, MixPorcentaje, PnlDetallado, WaterfallStep } from "@/services/metricsTypes";
import { activeExpenses, line, money, type PnlTotals, type TreasuryTotals } from "@/services/metricsLedger";
import { formatMxn, round2 } from "@/services/money";

function step(
  key: string,
  label: string,
  amount: number,
  kind: WaterfallStep["kind"],
  runningTotal: number,
): WaterfallStep {
  return {
    key,
    label,
    amount: round2(amount),
    amountFormatted: formatMxn(round2(amount)),
    kind,
    runningTotal: round2(runningTotal),
    runningTotalFormatted: formatMxn(round2(runningTotal)),
  };
}

function scaleOpexMix(fijoAux: number, variableAux: number, opexLedger: number): { fijo: number; variable: number } {
  const auxTotal = fijoAux + variableAux;
  if (auxTotal < 0.01) {
    return { fijo: 0, variable: round2(opexLedger) };
  }
  const factor = opexLedger / auxTotal;
  const fijo = round2(fijoAux * factor);
  return { fijo, variable: round2(opexLedger - fijo) };
}

/**
 * Cascada de P&L. OpEx fijo/variable se escala al OpEx de balanza.
 * Impuestos/financiero: PyG si existe; si no, servicio de deuda de tesorería.
 */
export function buildPnlDetallado(
  pnl: PnlTotals,
  treasury: TreasuryTotals,
  egresos: AuxiliarEgresos[],
): PnlDetallado {
  const activos = activeExpenses(egresos);
  const opexRows = activos.filter((fila) => fila.tipoInversion === "OpEx");
  const fijoAux = round2(
    opexRows.filter((fila) => fila.clasificacionGasto === "Fijo").reduce((acc, fila) => acc + money(fila.montoSubtotal), 0),
  );
  const variableAux = round2(
    opexRows
      .filter((fila) => fila.clasificacionGasto === "Variable")
      .reduce((acc, fila) => acc + money(fila.montoSubtotal), 0),
  );
  const opexCash = round2(Math.max(pnl.opex - pnl.da, 0));
  const { fijo: opexFijo, variable: opexVariable } = scaleOpexMix(fijoAux, variableAux, opexCash);

  const impuestosPnl = pnl.impuestosFinancierosPnl;
  const impuestosFinancieros = impuestosPnl > 0.01 ? impuestosPnl : treasury.servicioDeuda;
  const utilidadNeta = round2(pnl.ebit - impuestosFinancieros);
  const ebitda = round2(pnl.ebit + pnl.da);

  const waterfall: WaterfallStep[] = [];
  let running = pnl.ingresos;
  waterfall.push(step("ingresos", "Ingresos totales", pnl.ingresos, "increase", running));
  running = round2(running - pnl.cogs);
  waterfall.push(step("cogs", "COGS", -pnl.cogs, "decrease", running));
  waterfall.push(step("utilidadBruta", "Utilidad bruta", pnl.utilidadBruta, "total", running));
  running = round2(running - opexFijo);
  waterfall.push(step("opexFijo", "OpEx fijo", -opexFijo, "decrease", running));
  running = round2(running - opexVariable);
  waterfall.push(step("opexVariable", "OpEx variable", -opexVariable, "decrease", running));
  waterfall.push(step("ebitda", "EBITDA", ebitda, "total", ebitda));
  running = round2(ebitda - pnl.da);
  waterfall.push(step("da", "Depreciaciones/Amortizaciones", -pnl.da, "decrease", running));
  waterfall.push(step("ebit", "EBIT", pnl.ebit, "total", pnl.ebit));
  running = round2(pnl.ebit - impuestosFinancieros);
  waterfall.push(step("impuestosFinanciero", "Impuestos/Financiero", -impuestosFinancieros, "decrease", running));
  waterfall.push(step("utilidadNeta", "Utilidad neta", utilidadNeta, "total", utilidadNeta));

  const totalEgresos = round2(activos.reduce((acc, fila) => acc + money(fila.montoSubtotal), 0));
  const fijoEgresos = round2(
    activos.filter((fila) => fila.clasificacionGasto === "Fijo").reduce((acc, fila) => acc + money(fila.montoSubtotal), 0),
  );
  const variableEgresos = round2(totalEgresos - fijoEgresos);
  const mixCostos: MixPorcentaje = {
    fijoPct: totalEgresos > 0.01 ? round2((fijoEgresos / totalEgresos) * 100) : null,
    variablePct: totalEgresos > 0.01 ? round2((variableEgresos / totalEgresos) * 100) : null,
    fijo: line(fijoEgresos),
    variable: line(variableEgresos),
    totalEgresos: line(totalEgresos),
  };

  const byCentro = new Map<string, number>();
  for (const fila of opexRows) {
    byCentro.set(fila.centroDeCostos, (byCentro.get(fila.centroDeCostos) ?? 0) + money(fila.montoSubtotal));
  }
  const opexAuxTotal = round2([...byCentro.values()].reduce((acc, n) => acc + n, 0));
  const opexPorCentro: CentroCostoLine[] = [...byCentro.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([centroDeCostos, montoRaw]) => {
      const monto = round2(montoRaw);
      return {
        centroDeCostos,
        monto,
        montoFormatted: formatMxn(monto),
        pct: opexAuxTotal > 0.01 ? round2((monto / opexAuxTotal) * 100) : 0,
      };
    });

  return { waterfall, mixCostos, opexPorCentro };
}
