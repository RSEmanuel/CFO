import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presentarNombre } from "./textoPresentable";

describe("presentarNombre", () => {
  it("baja el grito de CONTPAQi y conserva siglas", () => {
    assert.equal(presentarNombre("SERVICIOS MARÍTIMOS"), "Servicios marítimos");
    assert.equal(presentarNombre("BBVA BANCOMER"), "BBVA bancomer");
    assert.equal(presentarNombre("SUELDOS Y SALARIOS"), "Sueldos y salarios");
    assert.equal(presentarNombre("ACME SA DE CV"), "Acme SA de CV");
    assert.equal(presentarNombre("S.A. DE C.V."), "S.A. de C.V.");
    assert.equal(presentarNombre("IVA POR PAGAR"), "IVA por pagar");
  });

  it("no reescribe un nombre que ya trae minúsculas", () => {
    assert.equal(presentarNombre("Servicios marítimos"), "Servicios marítimos");
    assert.equal(presentarNombre("Sueldos y Salarios"), "Sueldos y Salarios");
    assert.equal(presentarNombre("Ingresos"), "Ingresos");
  });
});
