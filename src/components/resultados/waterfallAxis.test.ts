import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waterfallLabelsOverlap } from "./waterfallAxis";

const EN = [
  "Total revenue",
  "Costs",
  "Gross profit",
  "Operating expenses",
  "EBIT",
  "Financial income",
  "Financial expenses",
  "Income tax and profit sharing",
  "Net income",
];

const ES = [
  "Ingresos totales",
  "Costos",
  "Utilidad bruta",
  "Gastos operativos",
  "EBIT",
  "Productos financieros",
  "Gastos financieros",
  "ISR y PTU",
  "Utilidad neta",
];

describe("eje de la cascada", () => {
  it("inclina las etiquetas en el ancho donde hoy se enciman", () => {
    assert.equal(waterfallLabelsOverlap(787, EN), true);
    assert.equal(waterfallLabelsOverlap(787, ES), true);
  });

  it("las deja en dos renglones cuando la pantalla da espacio", () => {
    assert.equal(waterfallLabelsOverlap(1600, EN), false);
    assert.equal(waterfallLabelsOverlap(1100, ES), false);
  });
});