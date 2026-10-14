import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAntiguedad } from "./antiguedad";
import { buildClientesQueNoPagan } from "./clientesQueNoPagan";
import { buildCobranza, saldoDe, type CobranzaFactura } from "./cobranzaTransformer";

const AS_OF = "2026-06-30";

// Emitida hace 120 días pero vence en el futuro: no está vencida.
const facturas: CobranzaFactura[] = [
  { cliente: "Cliente A", fechaEmision: "2026-03-01", fechaVencimiento: "2026-07-15", monto: 1_000, cobrado: 0 },
  { cliente: "Cliente B", fechaEmision: "2026-06-01", fechaVencimiento: "2026-04-15", monto: 500, cobrado: 100 },
];

describe("cobranza: un solo criterio de antigüedad (vencimiento)", () => {
  it("una factura emitida hace meses pero aún en plazo sale corriente, con 0 días", () => {
    const model = buildCobranza(facturas, AS_OF);
    const a = model.clientes.find((row) => row.cliente === "Cliente A");
    assert.equal(a?.dias, 0);
    assert.equal(a?.bucket, "corriente");
  });

  it("el % mayor a 60 días cuenta días vencidos, no días desde la emisión", () => {
    const model = buildCobranza(facturas, AS_OF);
    // Solo B (saldo 400) lleva más de 60 días vencida; A (1,000) sigue en plazo.
    assert.equal(model.cxcAbierta, 1_400);
    assert.equal(model.pctMayor60, 28.57);
  });

  it("el mismo cliente cae en el mismo rango en Saldos por cliente, Antigüedad y la lista de morosos", () => {
    const documentos = facturas.map((factura) => ({
      tercero: factura.cliente,
      fechaVencimiento: factura.fechaVencimiento,
      saldo: saldoDe(factura),
    }));
    const cobranza = buildCobranza(facturas, AS_OF);
    const antiguedad = buildAntiguedad(documentos, AS_OF);
    const noPagan = buildClientesQueNoPagan(documentos, AS_OF);

    for (const row of cobranza.clientes) {
      const enAntiguedad = antiguedad.terceros.find((tercero) => tercero.tercero === row.cliente);
      assert.equal(row.bucket, enAntiguedad?.bucket);
      assert.equal(Math.max(0, enAntiguedad?.diasVencidos ?? -1), row.dias);
    }
    assert.deepEqual(
      noPagan.clientes.map((row) => [row.cliente, row.diasVencidos]),
      cobranza.clientes.filter((row) => row.dias > 0).map((row) => [row.cliente, row.dias]),
    );
  });
});
