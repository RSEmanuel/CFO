import type { FinancialSource, RatioMetric, SaludFinanciera } from "@/services/metricsTypes";
import {
  line,
  safeRatio,
  type BalanceStructure,
  type PnlTotals,
  type TreasuryTotals,
} from "@/services/metricsLedger";
import { formatMxn, round2 } from "@/services/money";

function ratio(numerator: number, denominator: number): RatioMetric {
  return {
    value: safeRatio(numerator, denominator),
    numerator: round2(numerator),
    numeratorFormatted: formatMxn(round2(numerator)),
    denominator: round2(denominator),
    denominatorFormatted: formatMxn(round2(denominator)),
  };
}

/**
 * Ratio contra capital contable: con capital ≤ 0 (déficit patrimonial) el
 * ratio no es significativo → value null (la UI muestra N/D). El denominador
 * se reporta con su signo económico para evidenciar el déficit.
 */
function ratioSobreCapital(numerator: number, capital: number): RatioMetric {
  return {
    value: capital > 0.01 ? safeRatio(numerator, capital) : null,
    numerator: round2(numerator),
    numeratorFormatted: formatMxn(round2(numerator)),
    denominator: round2(capital),
    denominatorFormatted: formatMxn(round2(capital)),
  };
}

/**
 * Ratios de estructura sobre saldos de cierre. La cobertura de intereses usa el EBIT
 * del corte (mensual o YTD) y gastos financieros de PyG o tesorería.
 */
export function buildSaludFinanciera(
  structure: BalanceStructure,
  pnl: PnlTotals,
  treasury: TreasuryTotals,
): SaludFinanciera {
  const gastosPnl = pnl.gastosFinancierosPnl;
  const fuente: FinancialSource = gastosPnl > 0.01 ? "pnl" : "tesoreria";
  const gastosFinancieros = fuente === "pnl" ? gastosPnl : treasury.servicioDeuda;

  const pasivoCp = Math.abs(structure.pasivoCirculante);

  return {
    liquidezCorriente: ratio(structure.activoCirculante, pasivoCp),
    pruebaAcida: ratio(structure.activoCirculante - structure.inventarios, pasivoCp),
    // Endeudamiento = |Pasivo total| / capital contable NIF (3xxx + resultado
    // YTD, signo económico). Con déficit (capital ≤ 0) no es significativo →
    // N/D en vez de un ratio silencioso sobre la magnitud cruda del 3xxx.
    endeudamientoTotal: ratioSobreCapital(Math.abs(structure.pasivoTotal), structure.patrimonioNif),
    coberturaIntereses: {
      ...ratio(pnl.ebit, gastosFinancieros),
      fuenteGastosFinancieros: fuente,
    },
    activoCirculante: line(structure.activoCirculante),
    pasivoCirculante: line(structure.pasivoCirculante),
    inventarios: line(structure.inventarios),
    pasivoTotal: line(structure.pasivoTotal),
    // Capital contable NIF con signo económico: negativo = déficit patrimonial.
    patrimonioNeto: line(structure.patrimonioNif),
    ebit: line(pnl.ebit),
    gastosFinancieros: line(gastosFinancieros),
  };
}

