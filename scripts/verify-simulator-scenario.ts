/** Verificación puntual del simulador con el baseline real jul-2026. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getSimulatorBaseline } from "../src/services/simulatorBaselineService";
import { baselineDerived, simulate, ZERO_DELTAS } from "../src/services/simulatorEngine";

function mxn(value: number | null): string {
  if (value == null) return "N/D";
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

async function main() {
  const tenantId = "cmtnpxzcm00003slj2os3og3p";
  const baseline = await getSimulatorBaseline(tenantId, 2026, 7);

  console.log("=== BASELINE jul-2026 ===");
  console.log("ventas:", mxn(baseline.ventas), "| cogs:", mxn(baseline.cogs), "| opex:", mxn(baseline.opex));
  console.log("da:", mxn(baseline.da), "| ebitda:", mxn(baseline.ebitda), "| rif:", mxn(baseline.rif));
  console.log("ebt:", mxn(baseline.ebt), "| impuestos:", mxn(baseline.impuestos), "| neta:", mxn(baseline.utilidadNeta));
  console.log("dso:", baseline.dso, "| dpo:", baseline.dpo, "| dio:", baseline.dio, "| ccc:", baseline.ccc);
  console.log("deuda:", mxn(baseline.deudaFinanciera), "| caja:", mxn(baseline.caja), "| burn:", mxn(baseline.salidasOperativas));
  console.log("tasaEfectiva:", baseline.tasaEfectiva, "| kd mensual:", baseline.costoDeudaMensual);
  console.log("runway base (meses):", baselineDerived(baseline).cashRunwayMeses);

  const identidad = simulate(baseline, ZERO_DELTAS);
  console.log("\n=== IDENTIDAD (sliders en 0) ===");
  console.log("ingresos sim:", mxn(identidad.ingresos), "| ebitda sim:", mxn(identidad.ebitda));
  console.log("impuestos sim (fallback 30%):", mxn(identidad.impuestos), "| neta sim:", mxn(identidad.utilidadNeta));
  console.log("deltaCaja:", mxn(identidad.deltaCaja), "| ccc sim:", identidad.ccc, "| runway sim:", identidad.cashRunwayMeses);

  const sim = simulate(baseline, { crecimientoVentasPct: 10, dsoDias: -10, dpoDias: 15 });
  console.log("\n=== ESCENARIO: ventas +10%, DSO -10, DPO +15 ===");
  console.log("ingresos:", mxn(sim.ingresos), "(base", mxn(baseline.ventas) + ")");
  console.log("cogs:", mxn(sim.cogs), "(base", mxn(baseline.cogs) + ")");
  console.log("utilidadBruta:", mxn(sim.utilidadBruta));
  console.log("opex:", mxn(sim.opex), "(sin cambio)");
  console.log("ebitda:", mxn(sim.ebitda), "| margen:", sim.margenEbitdaPct, "% (base", baselineDerived(baseline).margenEbitdaPct, "%)");
  console.log("ebit:", mxn(sim.ebit));
  console.log("gastosFin:", mxn(sim.gastosFinancieros), "| rif:", mxn(sim.rif));
  console.log("ebt:", mxn(sim.ebt));
  console.log("tasa aplicada:", sim.tasaAplicada, "| impuestos:", mxn(sim.impuestos));
  console.log("utilidadNeta:", mxn(sim.utilidadNeta), "(base", mxn(baseline.utilidadNeta) + ")");
  console.log("deltaCxc:", mxn(sim.deltaCxc), "| deltaCxp:", mxn(sim.deltaCxp), "| deltaNwc:", mxn(sim.deltaNwc));
  console.log("deltaEbitda:", mxn(sim.deltaEbitda));
  console.log("deltaCaja:", mxn(sim.deltaCaja));
  console.log("caja sim:", mxn(sim.caja), "(base", mxn(baseline.caja) + ")");
  console.log("dso sim:", sim.dso, "| dpo sim:", sim.dpo, "| ccc sim:", sim.ccc, "(base", baseline.ccc + ")");
  console.log("burn sim:", mxn(sim.burnMensual), "| runway sim (meses):", sim.cashRunwayMeses, "(base", baselineDerived(baseline).cashRunwayMeses + ")");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
