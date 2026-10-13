import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFlujoAlertas, type FlujoMensual } from "@/services/flujoTransformer";

/** Cifras evidentemente de ejemplo. */
function mes(periodo: string, campos: Partial<FlujoMensual>): FlujoMensual {
  return {
    periodo,
    saldoInicial: 1000,
    entradasOperativas: 500,
    salidasOperativas: 400,
    salidasCapex: 0,
    servicioDeuda: 0,
    saldoFinal: 1100,
    ...campos,
  };
}

describe("alertas de caja con monto", () => {
  it("poca caja: usa tu caja y meses de respiro de la balanza, no la tesorería", () => {
    const alerts = buildFlujoAlertas([mes("2026-07", { saldoFinal: 9999 })], "2026-07", { caja: 500, mesesDeRespiro: 1.25 });
    assert.deepEqual(alerts, [{ kind: "lowRunway", caja: 500, meses: 1.25 }]);
  });

  it("poca caja alerta aunque no haya tesorería", () => {
    assert.deepEqual(buildFlujoAlertas([], "2026-07", { caja: 500, mesesDeRespiro: 1 }), [
      { kind: "lowRunway", caja: 500, meses: 1 },
    ]);
  });

  it("con caja suficiente o sin meses de respiro no alerta", () => {
    assert.deepEqual(buildFlujoAlertas([mes("2026-07", {})], "2026-07", { caja: 1000, mesesDeRespiro: 2.5 }), []);
    assert.deepEqual(buildFlujoAlertas([mes("2026-07", {})], "2026-07", { caja: 1000, mesesDeRespiro: null }), []);
  });

  it("dos meses seguidos con más salidas que entradas: suma lo que se fue", () => {
    const rows = [
      mes("2026-06", { saldoInicial: 2000, saldoFinal: 1900 }),
      mes("2026-07", { saldoInicial: 1900, saldoFinal: 1750 }),
    ];
    assert.deepEqual(buildFlujoAlertas(rows, "2026-07", null), [{ kind: "negativeTwoMonths", salidaNeta: 250 }]);
  });

  it("inversión que se come más de la mitad de las entradas de operación", () => {
    const alerts = buildFlujoAlertas([mes("2026-07", { salidasCapex: 300, entradasOperativas: 500 })], "2026-07", null);
    assert.deepEqual(alerts, [{ kind: "highCapex", capex: 300, entradas: 500 }]);
  });

  it("las alertas de movimientos son del mes elegido, nunca de otro", () => {
    const rows = [mes("2026-06", { salidasCapex: 300, entradasOperativas: 500 })];
    assert.deepEqual(buildFlujoAlertas(rows, "2026-07", null), []);
  });
});
