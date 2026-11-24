import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextoComparacion, etiquetaPeriodo } from "./format";
import { createT } from "./translate";

describe("etiquetas de periodo y de comparación", () => {
  it("en inglés cambia solo los meses que se escriben distinto", () => {
    assert.equal(etiquetaPeriodo("Ago-25", "en"), "Aug-25");
    assert.equal(etiquetaPeriodo("Ene-26", "en"), "Jan-26");
    assert.equal(etiquetaPeriodo("ABR-26", "en"), "APR-26");
    assert.equal(etiquetaPeriodo("Dic-25", "en"), "Dec-25");
    assert.equal(etiquetaPeriodo("Jul-26", "en"), "Jul-26");
    assert.equal(etiquetaPeriodo("Q3-26", "en"), "Q3-26");
    assert.equal(etiquetaPeriodo("Ago-25", "es"), "Ago-25");
  });

  it("no toca palabras que no son periodos", () => {
    assert.equal(etiquetaPeriodo("Dictamen", "en"), "Dictamen");
    assert.equal(etiquetaPeriodo("1-30 días", "en"), "1-30 días");
  });

  it("traduce la frase de comparación de las tarjetas", () => {
    assert.equal(contextoComparacion("vs año anterior", createT("en")), "vs prior year");
    assert.equal(contextoComparacion("vs mes anterior", createT("es")), "vs mes anterior");
    assert.equal(contextoComparacion(null, createT("en")), null);
  });
});
