import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFlujoAlertas, mesesDeRespiro, type FlujoMensual } from "@/services/flujoTransformer";

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

describe("meses de respiro", () => {
  it("es caja al cierre entre salidas de operación del mes", () => {
    assert.equal(mesesDeRespiro(mes("2026-07", { saldoFinal: 1000, salidasOperativas: 400 })), 2.5);
  });

  it("sin salidas de operación no hay ritmo con qué medir: null, no infinito ni 0", () => {
    assert.equal(mesesDeRespiro(mes("2026-07", { salidasOperativas: 0 })), null);
  });
});

describe("alertas de caja con monto", () => {
  it("poca caja: dice cuánta caja hay y para cuántos meses alcanza", () => {
    const alerts = buildFlujoAlertas([mes("2026-07", { saldoFinal: 500, salidasOperativas: 400 })], "2026-07");
    assert.deepEqual(alerts, [{ kind: "lowRunway", caja: 500, meses: 1.25 }]);
  });

  it("con caja suficiente no alerta", () => {
    assert.deepEqual(buildFlujoAlertas([mes("2026-07", { saldoFinal: 1000, salidasOperativas: 400 })], "2026-07"), []);
  });

  it("dos meses seguidos con más salidas que entradas: suma lo que se fue", () => {
    const rows = [
      mes("2026-06", { saldoInicial: 2000, saldoFinal: 1900 }),
      mes("2026-07", { saldoInicial: 1900, saldoFinal: 1750 }),
    ];
    assert.deepEqual(buildFlujoAlertas(rows, "2026-07"), [{ kind: "negativeTwoMonths", salidaNeta: 250 }]);
  });

  it("inversión que se come más de la mitad de las entradas de operación", () => {
    const alerts = buildFlujoAlertas([mes("2026-07", { salidasCapex: 300, entradasOperativas: 500 })], "2026-07");
    assert.deepEqual(alerts, [{ kind: "highCapex", capex: 300, entradas: 500 }]);
  });

  it("sin tesorería no hay alertas", () => {
    assert.deepEqual(buildFlujoAlertas([], "2026-07"), []);
  });
});
