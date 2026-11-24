import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nombreCuentaVisible } from "./nombreVisible";
import { createT } from "./translate";

describe("nombre visible de la cuenta", () => {
  it("en inglés traduce la cuenta genérica y deja el nombre propio con el mismo tratamiento", () => {
    const t = createT("en");
    assert.equal(nombreCuentaVisible("SUELDOS Y SALARIOS", "6101-0001-0000-0000", "en", t), "Payroll");
    assert.equal(
      nombreCuentaVisible("Vtas y/o serv. grav. tasa gral", "4101-0001-0001-0000", "en", t),
      "Sales and/or services taxed at the general rate",
    );
    assert.equal(nombreCuentaVisible("BBVA BANCOMER", "1102-0001-0001-0000", "en", t), "BBVA bancomer");
  });

  it("en español solo ajusta mayúsculas y la cuenta de mayor usa el glosario", () => {
    const t = createT("es");
    assert.equal(nombreCuentaVisible("SUELDOS Y SALARIOS", "6101-0001-0000-0000", "es", t), "Sueldos y salarios");
    assert.equal(nombreCuentaVisible("Sueldos y Salarios", "6101-0001-0000-0000", "es", t), "Sueldos y salarios");
    assert.equal(nombreCuentaVisible("INGRESOS", "4101-0000-0000-0000", "es", t), "Ventas");
    assert.equal(nombreCuentaVisible("INGRESOS", "4101", "en", createT("en"), "pyg:ingresos:mayor:4101"), "Sales");
  });
});
