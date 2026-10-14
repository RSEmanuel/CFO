import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accionSinCobrar,
  buildClientesSinCobrar,
  capasAbiertas,
  clienteParaRevisar,
  type CuentaCartera,
} from "./carteraSinCobrar";

const INICIO = "2026-01-01";
const CORTE = "2026-07-31";

function cuenta(partial: Partial<CuentaCartera> & Pick<CuentaCartera, "cliente">): CuentaCartera {
  return { inicio: INICIO, saldoInicial: 0, saldoFinal: 0, movimientos: [], ...partial };
}

describe("clientes con facturas sin cobrar (PEPS sobre movimientos)", () => {
  it("un cobro liquida primero la factura más antigua", () => {
    const capas = capasAbiertas(
      cuenta({
        cliente: "A",
        saldoFinal: 150,
        movimientos: [
          { fecha: "2026-03-01", cargos: 100, abonos: 0 },
          { fecha: "2026-05-01", cargos: 100, abonos: 0 },
          { fecha: "2026-06-01", cargos: 0, abonos: 50 },
        ],
      }),
    );
    assert.deepEqual(
      capas.map((capa) => [capa.fecha, capa.monto]),
      [
        ["2026-03-01", 50],
        ["2026-05-01", 100],
      ],
    );
  });

  it("si el cobro cubre toda la factura vieja, los días se cuentan desde la siguiente", () => {
    const model = buildClientesSinCobrar(
      [
        cuenta({
          cliente: "A",
          saldoFinal: 100,
          movimientos: [
            { fecha: "2026-03-01", cargos: 100, abonos: 0 },
            { fecha: "2026-05-01", cargos: 100, abonos: 0 },
            { fecha: "2026-06-01", cargos: 0, abonos: 100 },
          ],
        }),
      ],
      CORTE,
    );
    assert.equal(model.clientes[0]?.diasSinCobrar, 91);
    assert.equal(model.clientes[0]?.alMenos, false);
  });

  it("el saldo inicial cuenta como 'al menos' los días desde que empiezan los datos", () => {
    const model = buildClientesSinCobrar([cuenta({ cliente: "A", saldoInicial: 500, saldoFinal: 500 })], CORTE);
    assert.equal(model.clientes[0]?.diasSinCobrar, 211);
    assert.equal(model.clientes[0]?.alMenos, true);
  });

  it("el monto es siempre el saldo final de la contabilidad", () => {
    const model = buildClientesSinCobrar(
      [cuenta({ cliente: "A", saldoFinal: 700, movimientos: [{ fecha: "2026-07-01", cargos: 200, abonos: 0 }] })],
      CORTE,
    );
    assert.equal(model.clientes[0]?.saldo, 700);
    // Faltan 500 que no están en los movimientos cargados: son más viejos que lo cargado.
    assert.equal(model.clientes[0]?.alMenos, true);
    assert.equal(model.clientes[0]?.diasSinCobrar, 211);
  });

  it("no lista clientes saldados ni con saldo a favor", () => {
    const model = buildClientesSinCobrar(
      [
        cuenta({ cliente: "Saldado", saldoFinal: 0.4, movimientos: [{ fecha: "2026-03-01", cargos: 100, abonos: 100 }] }),
        cuenta({ cliente: "Anticipo", saldoFinal: -300, movimientos: [{ fecha: "2026-03-01", cargos: 0, abonos: 300 }] }),
      ],
      CORTE,
    );
    assert.equal(model.clientes.length, 0);
    assert.equal(model.totalSaldo, 0);
    assert.equal(model.topCount, 0);
  });

  it("ordena por saldo y calcula la concentración en los 3 mayores", () => {
    const facturado = (cliente: string, monto: number) =>
      cuenta({ cliente, saldoFinal: monto, movimientos: [{ fecha: "2026-07-01", cargos: monto, abonos: 0 }] });
    const model = buildClientesSinCobrar(
      [facturado("D", 100), facturado("A", 400), facturado("C", 200), facturado("B", 300)],
      CORTE,
    );
    assert.deepEqual(
      model.clientes.map((row) => row.cliente),
      ["A", "B", "C", "D"],
    );
    assert.equal(model.topCount, 3);
    assert.equal(model.topPct, 90);
  });

  it("las acciones no suponen plazo: pasados 90 días piden revisarlo", () => {
    assert.equal(accionSinCobrar(30), "seguimiento");
    assert.equal(accionSinCobrar(31), "llamar");
    assert.equal(accionSinCobrar(61), "exigir_fecha");
    assert.equal(accionSinCobrar(91), "revisar_plazo");
  });

  it("la alerta apunta al de mayor monto entre los de más de 90 días", () => {
    const model = buildClientesSinCobrar(
      [
        cuenta({ cliente: "Grande y reciente", saldoFinal: 1_000, movimientos: [{ fecha: "2026-07-10", cargos: 1_000, abonos: 0 }] }),
        cuenta({ cliente: "Viejo", saldoFinal: 50, movimientos: [{ fecha: "2026-02-10", cargos: 50, abonos: 0 }] }),
      ],
      CORTE,
    );
    assert.equal(clienteParaRevisar(model)?.cliente, "Viejo");
  });
});
