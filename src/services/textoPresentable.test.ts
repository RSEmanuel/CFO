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

  it("deja en tipo oración un nombre que viene con mayúsculas mezcladas", () => {
    assert.equal(presentarNombre("Sueldos y Salarios"), "Sueldos y salarios");
    assert.equal(presentarNombre("Impuestos por Recuperar"), "Impuestos por recuperar");
    assert.equal(presentarNombre("Dep. Acum Equipo de Computo"), "Dep. acum equipo de computo");
    assert.equal(presentarNombre("Servicios marítimos"), "Servicios marítimos");
    assert.equal(presentarNombre("Ingresos"), "Ingresos");
  });

  it("en un nombre con minúsculas respeta siglas propias y marcas", () => {
    assert.equal(presentarNombre("Design SAPI De CV"), "Design SAPI de CV");
    assert.equal(presentarNombre("Desktop Lenovo, Monitor LG"), "Desktop lenovo, monitor LG");
    assert.equal(presentarNombre("AppleCare+ para MacBook Air (M2)"), "AppleCare+ para MacBook air (M2)");
    assert.equal(presentarNombre("IVA Retenido"), "IVA retenido");
  });

  it("limpia entidades HTML y espacios de sobra", () => {
    assert.equal(presentarNombre('LAPTOP  15.6&quot; '), 'Laptop 15.6"');
  });
});
