import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AntiguedadDocumento } from "./antiguedad";
import { accionSugerida, buildClientesQueNoPagan, clienteParaSuspender } from "./clientesQueNoPagan";

const AS_OF = "2026-06-30";

describe("clientes que no te pagan", () => {
  it("la acción sale de los días desde el vencimiento, con los cortes de Antigüedad", () => {
    assert.equal(accionSugerida(1), "recordar");
    assert.equal(accionSugerida(30), "recordar");
    assert.equal(accionSugerida(31), "llamar");
    assert.equal(accionSugerida(60), "llamar");
    assert.equal(accionSugerida(61), "exigir_fecha");
    assert.equal(accionSugerida(90), "exigir_fecha");
    assert.equal(accionSugerida(91), "suspender_credito");
  });

  it("solo cuenta lo vencido: lo que está en plazo o vence hoy no entra", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "Cliente A", fechaVencimiento: "2026-07-15", saldo: 500 },
      { tercero: "Cliente B", fechaVencimiento: "2026-06-30", saldo: 300 },
      { tercero: "Cliente C", fechaVencimiento: "2026-06-29", saldo: 100 },
    ];
    const model = buildClientesQueNoPagan(documentos, AS_OF);
    assert.deepEqual(
      model.clientes.map((row) => row.cliente),
      ["Cliente C"],
    );
    assert.equal(model.totalVencido, 100);
  });

  it("suma el vencido por cliente, toma la factura más antigua y ordena por monto", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "Cliente A", fechaVencimiento: "2026-06-20", saldo: 100 },
      { tercero: "Cliente A", fechaVencimiento: "2026-03-01", saldo: 200 },
      { tercero: "Cliente A", fechaVencimiento: "2026-08-01", saldo: 9_999 },
      { tercero: "Cliente B", fechaVencimiento: "2026-06-10", saldo: 50 },
      { tercero: "Cliente C", fechaVencimiento: "2026-06-10", saldo: 0 },
    ];
    const model = buildClientesQueNoPagan(documentos, AS_OF);
    assert.deepEqual(
      model.clientes.map((row) => [row.cliente, row.vencido, row.facturasVencidas]),
      [
        ["Cliente A", 300, 2],
        ["Cliente B", 50, 1],
      ],
    );
    assert.equal(model.clientes[0]?.diasVencidos, daysFrom("2026-03-01"));
    assert.equal(model.clientes[0]?.accion, "suspender_credito");
    assert.equal(model.clientes[1]?.accion, "recordar");
    assert.equal(model.totalVencido, 350);
  });

  it("calcula cuánto del vencido está en los 3 clientes más grandes", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "A", fechaVencimiento: "2026-06-01", saldo: 400 },
      { tercero: "B", fechaVencimiento: "2026-06-01", saldo: 300 },
      { tercero: "C", fechaVencimiento: "2026-06-01", saldo: 200 },
      { tercero: "D", fechaVencimiento: "2026-06-01", saldo: 100 },
    ];
    const model = buildClientesQueNoPagan(documentos, AS_OF);
    assert.equal(model.topCount, 3);
    assert.equal(model.topPct, 90);
  });

  it("sin nada vencido devuelve un modelo vacío, no ceros inventados", () => {
    const model = buildClientesQueNoPagan([{ tercero: "A", fechaVencimiento: "2026-07-30", saldo: 10 }], AS_OF);
    assert.equal(model.clientes.length, 0);
    assert.equal(model.totalVencido, 0);
    assert.equal(model.topCount, 0);
    assert.equal(clienteParaSuspender(model), null);
  });

  it("la alerta apunta al cliente de mayor monto entre los de más de 90 días", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "Grande pero reciente", fechaVencimiento: "2026-06-10", saldo: 1_000 },
      { tercero: "Chico y viejo", fechaVencimiento: "2026-01-10", saldo: 10 },
      { tercero: "Mediano y viejo", fechaVencimiento: "2026-02-10", saldo: 100 },
    ];
    const model = buildClientesQueNoPagan(documentos, AS_OF);
    assert.equal(clienteParaSuspender(model)?.cliente, "Mediano y viejo");
  });
});

function daysFrom(iso: string): number {
  return Math.floor((Date.UTC(2026, 5, 30) - Date.parse(iso)) / 86_400_000);
}
