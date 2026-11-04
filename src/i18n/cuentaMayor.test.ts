import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cuentaMayorCodes, cuentaMayorLabelKey } from "./cuentaMayor";
import { createT } from "./translate";

describe("glosario de cuentas de mayor", () => {
  it("traduce la cuenta de mayor y deja la subcuenta en el nombre del archivo", () => {
    const es = createT("es");
    const en = createT("en");
    const ventas = cuentaMayorLabelKey("4101");
    const ventasConCeros = cuentaMayorLabelKey("4101-0000-0000-0000");
    const ventasColapsada = cuentaMayorLabelKey(undefined, "pyg:ingresos:mayor:4101");
    assert.equal(ventas, "cuentasMayor.4101");
    assert.equal(ventasConCeros, ventas);
    assert.equal(ventasColapsada, ventas);
    assert.equal(es(ventas!), "Ventas");
    assert.equal(en(ventas!), "Sales");

    assert.equal(cuentaMayorLabelKey("4101-0001-0001-0000"), null);
    assert.equal(cuentaMayorLabelKey("4102-0000-0000-0000"), null);
    assert.equal(cuentaMayorLabelKey(undefined, "pyg:ingresos"), null);
  });

  it("cada código estándar tiene texto distinto en español y en inglés", () => {
    const es = createT("es");
    const en = createT("en");
    for (const code of cuentaMayorCodes()) {
      const key = cuentaMayorLabelKey(code);
      assert.ok(key, code);
      assert.notEqual(es(key!), key, code);
      assert.notEqual(en(key!), key, code);
      assert.notEqual(es(key!), en(key!), code);
    }
    assert.equal(en(cuentaMayorLabelKey("1102")!), "Banks");
    assert.equal(en(cuentaMayorLabelKey("1105")!), "Customers");
    assert.equal(en(cuentaMayorLabelKey("5101")!), "Cost of sales");
    assert.equal(en(cuentaMayorLabelKey("2110")!), "Payroll accrual");
    assert.equal(es(cuentaMayorLabelKey("6101-0000-0000-0000")!), "Gastos de venta");
  });
});
