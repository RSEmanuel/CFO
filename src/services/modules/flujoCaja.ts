import type { FlujoCaja, FlujoDesglose, ProyeccionMes } from "@/services/metricsTypes";
import {
  averageMonthlyTreasury,
  cashRunwayDays,
  groupTreasuryByPeriod,
  line,
  type TreasuryTotals,
} from "@/services/metricsLedger";
import type { TesoreriaFlujo } from "@/generated/prisma/client";
import { round2 } from "@/services/money";

function toDesglose(t: TreasuryTotals): FlujoDesglose {
  return {
    saldoInicial: line(t.saldoInicial),
    entradasOperativas: line(t.entradasOperativas),
    salidasOperativas: line(t.salidasOperativas),
    salidasCapex: line(t.salidasCapex),
    servicioDeuda: line(t.servicioDeuda),
    saldoFinal: line(t.saldoFinal),
    freeCashFlow: line(t.freeCashFlow),
  };
}

/**
 * Flujo del corte + proyección 3/6/12 a partir del promedio histórico 1..P.
 * El runway en tiempo real usa el burn del corte; el proyectado usa el burn promedio.
 */
export function buildFlujoCaja(input: {
  corte: TreasuryTotals;
  historial: TesoreriaFlujo[];
  saldoCierre: number;
  mesesEnCorte: number;
  view: "mensual" | "ytd";
}): FlujoCaja {
  const byPeriod = groupTreasuryByPeriod(input.historial);
  const promedio = averageMonthlyTreasury(byPeriod);

  const runwayRealtime =
    input.view === "mensual"
      ? cashRunwayDays(input.corte.saldoFinal, input.corte.salidasOperativas)
      : cashRunwayDays(
          input.saldoCierre,
          input.mesesEnCorte > 0 ? input.corte.salidasOperativas / input.mesesEnCorte : 0,
        );

  const burnProyectado = round2(
    promedio.salidasOperativas + promedio.salidasCapex + promedio.servicioDeuda - promedio.entradasOperativas,
  );
  const cashRunwayProyectadoDias =
    burnProyectado > 0.01 ? round2((input.saldoCierre / burnProyectado) * 30) : null;

  const netMonthly = round2(
    promedio.entradasOperativas - promedio.salidasOperativas - promedio.salidasCapex - promedio.servicioDeuda,
  );
  const fcfMonthly = round2(promedio.entradasOperativas - promedio.salidasOperativas - promedio.salidasCapex);

  const proyeccion: ProyeccionMes[] = ([3, 6, 12] as const).map((horizonte) => ({
    horizonte,
    entradas: line(round2(promedio.entradasOperativas * horizonte)),
    salidas: line(round2(promedio.salidasOperativas * horizonte)),
    capex: line(round2(promedio.salidasCapex * horizonte)),
    deuda: line(round2(promedio.servicioDeuda * horizonte)),
    fcfProyectado: line(round2(fcfMonthly * horizonte)),
    saldoProyectado: line(round2(input.saldoCierre + netMonthly * horizonte)),
  }));

  return {
    desglose: toDesglose(input.corte),
    cashRunwayDias: runwayRealtime,
    cashRunwayProyectadoDias,
    promedioMensualHistorico: toDesglose(promedio),
    proyeccion,
  };
}
