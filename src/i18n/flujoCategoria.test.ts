import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etiquetaFlujoCategoria } from "./flujoCategoria";
import { createT } from "./translate";

describe("etiquetas del flujo de efectivo", () => {
  const es = createT("es");
  const en = createT("en");

  it("traduce el concepto Compac y quita el prefijo Ingr/Egr", () => {
    assert.equal(etiquetaFlujoCategoria("cobranza", "Ingr cobranza", en), "Collections");
    assert.equal(etiquetaFlujoCategoria("sueldos", "Egr sueldos", en), "Payroll");
    assert.equal(etiquetaFlujoCategoria("pago-prestamos", "Egr pago prestamos", en), "Loan payments");
    assert.equal(etiquetaFlujoCategoria("reposic-caja", "Egr reposic. caja", en), "Petty cash replenishment");
    assert.equal(etiquetaFlujoCategoria("diversos-2", "Egr diversos", en), "Other");
    assert.equal(etiquetaFlujoCategoria("cobranza", "Ingr cobranza", es), "Cobranza");
    assert.equal(etiquetaFlujoCategoria("prestamos", "Ingr prestamos", es), "Préstamos");
    assert.equal(etiquetaFlujoCategoria("cheq-devuel", "Egr cheq. devuel.", es), "Cheques devueltos");
  });

  it("deja un concepto desconocido en limpio, sin gritarlo", () => {
    assert.equal(etiquetaFlujoCategoria("flete-especial", "EGR FLETE ESPECIAL", en), "Flete especial");
  });
});
