import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearlyEqual, round2 } from "@/services/money";
import {
  baselineDerived,
  clampDeltas,
  DELTA_LIMITS,
  sensitivityTornado,
  simulate,
  SIMULATOR_TAX_FALLBACK,
  ZERO_DELTAS,
  type SimulatorBaseline,
} from "@/services/simulatorEngine";

/**
 * Baseline sintético internamente consistente (calca los números reales de
 * jul-2026 pero con provisión de impuestos al 30% para que la identidad sea
 * exacta: impuestos = EBT × tasa y utilidadNeta = EBT − impuestos).
 */
const BASE: SimulatorBaseline = {
  tenantId: "tenant-demo",
  anio: 2026,
  periodo: 7,
  ventas: 4_193_494.13,
  cogs: 1_027_628.58,
  opex: 1_366_225.75,
  da: 59_904.09,
  ebit: 1_799_639.8,
  ebitda: 1_859_543.89,
  productosFinancieros: 12_000,
  gastosFinancieros: 212_211.96,
  rif: -200_211.96,
  ebt: 1_599_427.84,
  impuestos: 479_828.35,
  utilidadNeta: 1_119_599.49,
  dso: 36.57,
  dio: 0,
  dpo: 171.12,
  ccc: -134.55,
  ventasAnualizadas: 50_321_929.56,
  cogsAnualizado: 12_331_542.96,
  deudaFinanciera: 10_662_347.6,
  caja: 4_955_598.42,
  salidasOperativas: 2_500_000,
  tasaEfectiva: 0.3,
  costoDeudaMensual: 0.0199,
};

describe("simulatorEngine · identidad con deltas en cero", () => {
  it("sim ≡ baseline al centavo cuando todos los deltas son 0", () => {
    const sim = simulate(BASE, ZERO_DELTAS);
    assert.equal(sim.ingresos, BASE.ventas);
    assert.equal(sim.cogs, BASE.cogs);
    assert.equal(sim.utilidadBruta, round2(BASE.ventas - BASE.cogs));
    assert.equal(sim.opex, BASE.opex);
    assert.equal(sim.da, BASE.da);
    assert.equal(sim.ebitda, BASE.ebitda);
    assert.equal(sim.ebit, BASE.ebit);
    assert.equal(sim.productosFinancieros, BASE.productosFinancieros);
    assert.equal(sim.gastosFinancieros, BASE.gastosFinancieros);
    assert.equal(sim.rif, BASE.rif);
    assert.equal(sim.ebt, BASE.ebt);
    assert.equal(sim.impuestos, BASE.impuestos);
    assert.equal(sim.utilidadNeta, BASE.utilidadNeta);
    assert.equal(sim.dso, BASE.dso);
    assert.equal(sim.dio, BASE.dio);
    assert.equal(sim.dpo, BASE.dpo);
    assert.equal(sim.ccc, BASE.ccc);
    assert.equal(sim.deltaCxc, 0);
    assert.equal(sim.deltaCxp, 0);
    assert.equal(sim.deltaNwc, 0);
    assert.equal(sim.deltaEbitda, 0);
    assert.equal(sim.deltaCaja, 0);
    assert.equal(sim.caja, BASE.caja);
    assert.equal(sim.burnMensual, BASE.salidasOperativas);
    assert.equal(sim.cashRunwayMeses, round2(BASE.caja / BASE.salidasOperativas));
    assert.deepEqual(sim.deltas, ZERO_DELTAS);
  });

  it("deltas parciales se completan con 0 (simulate(baseline, {}) ≡ baseline)", () => {
    const sim = simulate(BASE, {});
    assert.equal(sim.utilidadNeta, BASE.utilidadNeta);
    assert.equal(sim.deltaCaja, 0);
  });
});

describe("simulatorEngine · P&L", () => {
  it("el crecimiento arrastra el costo variable y deja el OPEX fijo", () => {
    const sim = simulate(BASE, { crecimientoVentasPct: 10 });
    assert.equal(sim.ingresos, round2(BASE.ventas * 1.1));
    assert.equal(sim.cogs, round2(BASE.cogs * 1.1));
    // OPEX no escala con ventas (convención de OPEX fijo).
    assert.equal(sim.sga, round2(BASE.opex - BASE.da));
    assert.equal(sim.opex, BASE.opex);
    assert.equal(sim.ebitda, round2(sim.utilidadBruta - sim.sga));
    assert.ok(sim.ebitda > BASE.ebitda);
  });

  it("la sensibilidad de precios modula la absorción del COGS", () => {
    const mejor = simulate(BASE, { sensibilidadPreciosPct: 5 });
    assert.equal(mejor.cogs, round2(BASE.cogs * 0.95));
    const peor = simulate(BASE, { sensibilidadPreciosPct: -5 });
    assert.equal(peor.cogs, round2(BASE.cogs * 1.05));
  });

  it("la variación de OPEX solo mueve SG&A; la D&A queda constante", () => {
    const sim = simulate(BASE, { variacionOpexPct: 20 });
    const sgaBase = round2(BASE.opex - BASE.da);
    assert.equal(sim.sga, round2(sgaBase * 1.2));
    assert.equal(sim.da, BASE.da);
    assert.equal(sim.ebitda, round2(sim.utilidadBruta - sim.sga));
    assert.equal(sim.ebit, round2(sim.ebitda - BASE.da));
  });

  it("el delta de tasa reprecia la deuda: +1 pp anual = deuda × 1% / 12 al mes", () => {
    const sim = simulate(BASE, { tasaInteresDeltaPp: 1 });
    const esperado = round2(BASE.gastosFinancieros + BASE.deudaFinanciera / 100 / 12);
    assert.equal(sim.gastosFinancieros, esperado);
    assert.equal(sim.rif, round2(BASE.productosFinancieros - esperado));
    assert.equal(sim.ebt, round2(sim.ebit + sim.rif));
  });

  it("sin deuda financiera el delta de tasa no mueve el gasto", () => {
    const sinDeuda = simulate({ ...BASE, deudaFinanciera: 0 }, { tasaInteresDeltaPp: 5 });
    assert.equal(sinDeuda.gastosFinancieros, BASE.gastosFinancieros);
  });

  it("con EBT ≤ 0 no hay provisión de impuestos", () => {
    // Baseline de menores ventas: ni el peor escenario de BASE lleva el EBT a
    // negativo porque la estructura es muy rentable.
    const bajo = { ...BASE, ventas: 1_000_000, ventasAnualizadas: 12_000_000 };
    const sim = simulate(bajo, { crecimientoVentasPct: -30 });
    assert.ok(sim.ebt < 0);
    assert.equal(sim.impuestos, 0);
    assert.equal(sim.utilidadNeta, sim.ebt);
  });

  it("tasa real 0 aplica el fallback 30% del catálogo; tasa real > 0 se respeta", () => {
    const sinProvision = simulate({ ...BASE, tasaEfectiva: 0 }, ZERO_DELTAS);
    assert.equal(sinProvision.tasaAplicada, SIMULATOR_TAX_FALLBACK);
    assert.equal(sinProvision.impuestos, round2(BASE.ebt * SIMULATOR_TAX_FALLBACK));

    const conProvision = simulate(BASE, ZERO_DELTAS);
    assert.equal(conProvision.tasaAplicada, 0.3);
    assert.equal(conProvision.impuestos, BASE.impuestos);
  });
});

describe("simulatorEngine · caja y capital de trabajo", () => {
  it("DSO+ consume caja (ΔCxC > 0 → ΔCaja < 0 con lo demás en 0)", () => {
    const sim = simulate(BASE, { dsoDias: 10 });
    const esperadoCxc = round2(((BASE.ventas * 12) / 365) * 10);
    assert.equal(sim.deltaCxc, esperadoCxc);
    assert.ok(sim.deltaCxc > 0);
    assert.equal(sim.deltaNwc, sim.deltaCxc);
    assert.equal(sim.deltaCaja, round2(-sim.deltaNwc));
    assert.ok(sim.deltaCaja < 0);
    assert.equal(sim.caja, round2(BASE.caja + sim.deltaCaja));
  });

  it("DPO+ libera caja (ΔCxP > 0 → ΔNWC < 0 → ΔCaja > 0)", () => {
    const sim = simulate(BASE, { dpoDias: 15 });
    const esperadoCxp = round2(((BASE.cogs * 12) / 365) * 15);
    assert.equal(sim.deltaCxp, esperadoCxp);
    assert.ok(sim.deltaCxp > 0);
    assert.equal(sim.deltaNwc, round2(-sim.deltaCxp));
    assert.ok(sim.deltaNwc < 0);
    assert.equal(sim.deltaCaja, round2(sim.deltaEbitda - sim.deltaNwc));
    assert.ok(sim.deltaCaja > 0);
  });

  it("CCC sim = DSO_sim + DIO − DPO_sim", () => {
    const sim = simulate(BASE, { dsoDias: -10, dpoDias: 15 });
    assert.equal(sim.dso, round2(BASE.dso - 10));
    assert.equal(sim.dpo, round2(BASE.dpo + 15));
    assert.equal(sim.dio, BASE.dio);
    assert.equal(sim.ccc, round2(sim.dso + BASE.dio - sim.dpo));
  });

  it("el runway recalcula caja y burn con el escenario (definición #28)", () => {
    const sim = simulate(BASE, { crecimientoVentasPct: 10 });
    const sgaBase = round2(BASE.opex - BASE.da);
    const burnEsperado = round2(
      (BASE.salidasOperativas * round2(sim.sga + sim.cogs)) / round2(sgaBase + BASE.cogs),
    );
    assert.equal(sim.burnMensual, burnEsperado);
    assert.ok(sim.burnMensual != null && sim.burnMensual > BASE.salidasOperativas);
    assert.equal(sim.cashRunwayMeses, round2(sim.caja / burnEsperado));
  });
});

describe("simulatorEngine · guardas y límites", () => {
  it("ventas ≈ 0 → márgenes null (patrón safeRatio)", () => {
    const sim = simulate({ ...BASE, ventas: 0 }, { crecimientoVentasPct: 10 });
    assert.equal(sim.margenEbitdaPct, null);
    assert.equal(sim.margenNetoPct, null);
    const base = baselineDerived({ ...BASE, ventas: 0 });
    assert.equal(base.margenEbitdaPct, null);
    assert.equal(base.margenNetoPct, null);
  });

  it("sin salidas operativas el burn y el runway quedan null", () => {
    const sim = simulate({ ...BASE, salidasOperativas: 0 }, { crecimientoVentasPct: 10 });
    assert.equal(sim.burnMensual, null);
    assert.equal(sim.cashRunwayMeses, null);
    assert.equal(baselineDerived({ ...BASE, salidasOperativas: 0 }).cashRunwayMeses, null);
  });

  it("clampea deltas fuera de rango y normaliza valores no finitos", () => {
    const clamped = clampDeltas({
      crecimientoVentasPct: 100,
      sensibilidadPreciosPct: -50,
      variacionOpexPct: 45,
      dsoDias: 90,
      dpoDias: -90,
      tasaInteresDeltaPp: 12,
    });
    assert.equal(clamped.crecimientoVentasPct, DELTA_LIMITS.crecimientoVentasPct.max);
    assert.equal(clamped.sensibilidadPreciosPct, DELTA_LIMITS.sensibilidadPreciosPct.min);
    assert.equal(clamped.variacionOpexPct, DELTA_LIMITS.variacionOpexPct.max);
    assert.equal(clamped.dsoDias, DELTA_LIMITS.dsoDias.max);
    assert.equal(clamped.dpoDias, DELTA_LIMITS.dpoDias.min);
    assert.equal(clamped.tasaInteresDeltaPp, DELTA_LIMITS.tasaInteresDeltaPp.max);

    const sim = simulate(BASE, { crecimientoVentasPct: 100 });
    assert.equal(sim.deltas.crecimientoVentasPct, 30);
    assert.equal(sim.ingresos, round2(BASE.ventas * 1.3));

    const nan = clampDeltas({ crecimientoVentasPct: Number.NaN });
    assert.equal(nan.crecimientoVentasPct, 0);
  });

  it("los deltas aplicados nunca exceden los rangos aunque vengan extremos", () => {
    const sim = simulate(BASE, {
      crecimientoVentasPct: -1_000,
      sensibilidadPreciosPct: 1_000,
      variacionOpexPct: -1_000,
      dsoDias: 1_000,
      dpoDias: 1_000,
      tasaInteresDeltaPp: -1_000,
    });
    assert.deepEqual(sim.deltas, {
      crecimientoVentasPct: -30,
      sensibilidadPreciosPct: 10,
      variacionOpexPct: -20,
      dsoDias: 30,
      dpoDias: 30,
      tasaInteresDeltaPp: -3,
    });
  });
});

describe("simulatorEngine · tornado de sensibilidad", () => {
  it("devuelve los 6 drivers ordenados por span y con signos coherentes", () => {
    const rows = sensitivityTornado(BASE);
    assert.equal(rows.length, 6);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].span >= rows[i].span);
    }
    const dso = rows.find((row) => row.driver === "dsoDias");
    assert.ok(dso);
    // DSO en mínimo (−15 días) libera caja; en máximo (+30) la consume.
    assert.ok(dso.low > 0);
    assert.ok(dso.high < 0);
    const growth = rows.find((row) => row.driver === "crecimientoVentasPct");
    assert.ok(growth);
    assert.ok(growth.low < 0 && growth.high > 0);
    // La tasa no mueve la caja operativa del mes (ΔCaja = ΔEBITDA − ΔNWC).
    const rate = rows.find((row) => row.driver === "tasaInteresDeltaPp");
    assert.ok(rate);
    assert.ok(nearlyEqual(rate.low, 0) && nearlyEqual(rate.high, 0));
  });
});
