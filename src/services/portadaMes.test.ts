import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ErRow, ErRowKey } from "./estadoOperativo";
import { buildPortadaMes, MAX_ALERTAS, type PortadaInput } from "./portadaMes";

function fila(key: ErRowKey, actual: number | null, anterior: number | null): ErRow {
  return {
    key,
    role: "item",
    level: 0,
    invertDelta: false,
    acumulado: { monto: null, pct: null },
    mesActual: { monto: actual, pct: null },
    mesAnterior: { monto: anterior, pct: null },
    variacionMonto: null,
    variacionPp: null,
  };
}

const estado = (over: Partial<Record<ErRowKey, [number | null, number | null]>> = {}) => ({
  hasBalanza: true,
  filas: [
    fila("ventas", ...(over.ventas ?? [1000, 900])),
    fila("costo", ...(over.costo ?? [400, 400])),
    fila("totalOpex", ...(over.totalOpex ?? [300, 300])),
    fila("utilidadNeta", ...(over.utilidadNeta ?? [200, 150])),
  ],
});
const caja = (meses: number | null, cuentas = 2) => ({ hasBalanza: true, caja: 500, cuentas, mesesDeRespiro: meses });
const base: PortadaInput = { estado: estado(), caja: caja(4), cobranza: null };

describe("portada: tu mes en 5 números", () => {
  it("toma utilidad y gasto del PyG oficial y compara con el mes anterior", () => {
    const portada = buildPortadaMes(base);
    assert.equal(portada.ventas, 1000);
    assert.equal(portada.utilidad, 200);
    assert.equal(portada.utilidadAnterior, 150);
    assert.deepEqual(portada.gasto, { actual: 700, anterior: 700, variacionPct: 0 });
    assert.equal(portada.mesesDeRespiro, 4);
    assert.deepEqual(portada.alertas, []);
  });

  it("sin dato es null, nunca 0", () => {
    const portada = buildPortadaMes({ estado: null, caja: { hasBalanza: true, caja: 0, cuentas: 0, mesesDeRespiro: null }, cobranza: null });
    assert.equal(portada.utilidad, null);
    assert.equal(portada.caja, null);
    assert.equal(portada.mesesDeRespiro, null);
    assert.equal(portada.clientes, null);
    assert.equal(portada.gasto, null);
  });

  it("sin mes anterior no hay variación de gasto ni alerta de gasto", () => {
    const portada = buildPortadaMes({ ...base, estado: estado({ costo: [400, null], totalOpex: [300, null] }) });
    assert.equal(portada.gasto?.anterior, null);
    assert.equal(portada.gasto?.variacionPct, null);
    assert.equal(portada.alertas.length, 0);
  });

  it("alerta de caja baja con el umbral de Flujo", () => {
    assert.equal(buildPortadaMes({ ...base, caja: caja(1.4) }).alertas[0]?.kind, "lowRunway");
    assert.equal(buildPortadaMes({ ...base, caja: caja(1.5) }).alertas.length, 0);
  });

  it("alerta de pérdida con el monto y de gasto que sube 10% o más", () => {
    const perdida = buildPortadaMes({ ...base, estado: estado({ utilidadNeta: [-80, 20] }) });
    assert.deepEqual(perdida.alertas, [{ kind: "perdida", monto: 80 }]);
    const sube = buildPortadaMes({ ...base, estado: estado({ costo: [500, 400] }) });
    assert.deepEqual(sube.alertas, [{ kind: "gastoSube", pct: 14.29, monto: 100 }]);
  });

  it("clientes: con vencimiento manda 'vencido'; sin él, 'sinCobrar' estimado", () => {
    const vencido = buildPortadaMes({
      ...base,
      cobranza: {
        clientesQueNoPagan: {
          totalVencido: 300,
          topCount: 1,
          topPct: 100,
          clientes: [{ cliente: "A", vencido: 300, diasVencidos: 120, facturasVencidas: 1, accion: "suspender_credito" }],
        },
        clientesSinCobrar: null,
      },
    });
    assert.deepEqual(vencido.clientes, { monto: 300, base: "vencido" });
    assert.deepEqual(vencido.alertas, [{ kind: "clienteSuspender", cliente: "A", monto: 300, dias: 120 }]);

    const sinCobrar = buildPortadaMes({
      ...base,
      cobranza: {
        clientesQueNoPagan: null,
        clientesSinCobrar: {
          totalSaldo: 90,
          topCount: 1,
          topPct: 100,
          clientes: [{ cliente: "B", saldo: 90, diasSinCobrar: 100, alMenos: false, accion: "revisar_plazo" }],
        },
      },
    });
    assert.deepEqual(sinCobrar.clientes, { monto: 90, base: "sinCobrar" });
    assert.equal(sinCobrar.alertas[0]?.kind, "clienteRevisar");
  });

  it("nunca pasa de 3 alertas y prioriza caja y clientes", () => {
    const portada = buildPortadaMes({
      estado: estado({ utilidadNeta: [-10, 5], costo: [900, 400] }),
      caja: caja(0.5),
      cobranza: {
        clientesQueNoPagan: {
          totalVencido: 300,
          topCount: 1,
          topPct: 100,
          clientes: [{ cliente: "A", vencido: 300, diasVencidos: 120, facturasVencidas: 1, accion: "suspender_credito" }],
        },
        clientesSinCobrar: null,
      },
    });
    assert.equal(portada.alertas.length, MAX_ALERTAS);
    assert.deepEqual(
      portada.alertas.map((alerta) => alerta.kind),
      ["lowRunway", "clienteSuspender", "perdida"],
    );
  });
});
