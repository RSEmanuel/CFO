import type { AuxiliarEgresos, AuxiliarVentas, BalanzaPnL } from "@/generated/prisma/client";
import type {
  ClienteConcentracion,
  LineaNegocioRow,
  UnitEconomics,
  VariacionRubro,
} from "@/services/metricsTypes";
import {
  activeExpenses,
  activeSales,
  line,
  money,
  ratioPct,
  type PnlTotals,
} from "@/services/metricsLedger";
import { formatMxn, round2 } from "@/services/money";

function rankClientes(ventas: AuxiliarVentas[]): {
  ranked: ClienteConcentracion[];
  total: number;
} {
  const byCliente = new Map<string, { idCliente: string; nombreCliente: string; facturacion: number }>();
  for (const fila of activeSales(ventas)) {
    const current = byCliente.get(fila.idCliente);
    const facturacion = money(fila.montoSubtotal);
    if (current) {
      current.facturacion += facturacion;
    } else {
      byCliente.set(fila.idCliente, {
        idCliente: fila.idCliente,
        nombreCliente: fila.nombreCliente,
        facturacion,
      });
    }
  }
  const total = round2([...byCliente.values()].reduce((acc, item) => acc + item.facturacion, 0));
  const ranked = [...byCliente.values()]
    .sort((a, b) => b.facturacion - a.facturacion)
    .map((item) => {
      const facturacion = round2(item.facturacion);
      return {
        idCliente: item.idCliente,
        nombreCliente: item.nombreCliente,
        facturacion,
        facturacionFormatted: formatMxn(facturacion),
        pct: total > 0.01 ? round2((facturacion / total) * 100) : 0,
      };
    });
  return { ranked, total };
}

function sliceTop(ranked: ClienteConcentracion[], n: number, total: number) {
  const top = ranked.slice(0, n);
  const topFact = round2(top.reduce((acc, item) => acc + item.facturacion, 0));
  return {
    top,
    pct: total > 0.01 ? round2((topFact / total) * 100) : 0,
    topFact,
  };
}

export function buildUnitEconomics(input: {
  ventas: AuxiliarVentas[];
  egresos: AuxiliarEgresos[];
  balanza: BalanzaPnL[];
  pnl: PnlTotals;
}): UnitEconomics {
  const ventasNetas = activeSales(input.ventas);
  const byLinea = new Map<string, number>();
  for (const fila of ventasNetas) {
    byLinea.set(fila.lineaNegocio, (byLinea.get(fila.lineaNegocio) ?? 0) + money(fila.montoSubtotal));
  }
  const facturacionTotal = round2([...byLinea.values()].reduce((acc, n) => acc + n, 0));

  const porLineaNegocio: LineaNegocioRow[] = [...byLinea.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lineaNegocio, factRaw]) => {
      const facturacion = round2(factRaw);
      const share = facturacionTotal > 0.01 ? facturacion / facturacionTotal : 0;
      const cogsAsignado = round2(input.pnl.cogs * share);
      const utilidadBruta = round2(facturacion - cogsAsignado);
      return {
        lineaNegocio,
        facturacion,
        facturacionFormatted: formatMxn(facturacion),
        cogsAsignado,
        cogsAsignadoFormatted: formatMxn(cogsAsignado),
        utilidadBruta,
        utilidadBrutaFormatted: formatMxn(utilidadBruta),
        margenBrutoPct: facturacion > 0.01 ? round2((utilidadBruta / facturacion) * 100) : null,
        pctFacturacion: facturacionTotal > 0.01 ? round2(share * 100) : 0,
      };
    });

  const { ranked, total } = rankClientes(input.ventas);
  const top5 = sliceTop(ranked, 5, total);
  const top10 = sliceTop(ranked, 10, total);
  const restoMonto = round2(total - top10.topFact);

  const concentracionClientes = {
    top5: top5.top,
    top10: top10.top,
    top5Pct: top5.pct,
    top10Pct: top10.pct,
    resto: {
      idCliente: "RESTO",
      nombreCliente: "Resto de clientes",
      facturacion: restoMonto,
      facturacionFormatted: formatMxn(restoMonto),
      pct: total > 0.01 ? round2((restoMonto / total) * 100) : 0,
    },
    totalFacturacion: line(total),
  };

  const ingresoCuentas = new Map<
    string,
    { id: string; nombre: string; real: number; budget: number }
  >();
  for (const fila of input.balanza.filter((row) => row.categoriaMaestra === "Ingreso")) {
    const current = ingresoCuentas.get(fila.idCuenta) ?? {
      id: fila.idCuenta,
      nombre: fila.nombreCuenta,
      real: 0,
      budget: 0,
    };
    current.real += money(fila.haber) - money(fila.debe);
    current.budget += money(fila.montoPresupuestado);
    current.nombre = fila.nombreCuenta;
    ingresoCuentas.set(fila.idCuenta, current);
  }
  const realVsBudgetIngresos: VariacionRubro[] = [...ingresoCuentas.values()]
    .map((item) => {
      const real = round2(item.real);
      const budget = round2(item.budget);
      return {
        id: item.id,
        nombre: item.nombre,
        real,
        realFormatted: formatMxn(real),
        budget,
        budgetFormatted: formatMxn(budget),
        variacionPct: ratioPct(real, budget),
      };
    })
    .sort((a, b) => b.real - a.real);

  const opexBudget = round2(
    input.balanza
      .filter((fila) => fila.categoriaMaestra === "OpEx")
      .reduce((acc, fila) => acc + money(fila.montoPresupuestado), 0),
  );
  const opexEgresos = activeExpenses(input.egresos).filter((fila) => fila.tipoInversion === "OpEx");
  const byCentro = new Map<string, number>();
  for (const fila of opexEgresos) {
    byCentro.set(fila.centroDeCostos, (byCentro.get(fila.centroDeCostos) ?? 0) + money(fila.montoSubtotal));
  }
  const gastoTotal = round2([...byCentro.values()].reduce((acc, n) => acc + n, 0));
  const realVsBudgetCentros: VariacionRubro[] = [...byCentro.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, realRaw]) => {
      const real = round2(realRaw);
      const budget = gastoTotal > 0.01 ? round2(opexBudget * (real / gastoTotal)) : null;
      return {
        id: nombre,
        nombre,
        real,
        realFormatted: formatMxn(real),
        budget,
        budgetFormatted: budget == null ? null : formatMxn(budget),
        variacionPct: budget == null ? null : ratioPct(real, budget),
      };
    });

  return {
    porLineaNegocio,
    concentracionClientes,
    realVsBudgetIngresos,
    realVsBudgetCentros,
  };
}
