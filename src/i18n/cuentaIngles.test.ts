import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traducirCuentaAlIngles } from "./cuentaIngles";

/** Nombres tal como llegan del catálogo CONTPAQi (abreviados, truncados, con mayúsculas mezcladas). */
const CASOS: Array<[string, string]> = [
  ["Vtas y/o serv. grav. tasa gral", "Sales and/or services taxed at the general rate"],
  ["VTAS. Y/O SERV. GRAV T.CERO", "Sales and/or services taxed at the zero rate"],
  ["Dev sobre Vts tasa gral", "Sales returns at the general rate"],
  ["CAJA CHICA", "Petty cash"],
  ["Impuestos por Recuperar", "Recoverable taxes"],
  ["ISR RETENIDO POR BANCOS", "Income tax withheld by banks"],
  ["IVA por acreditar", "VAT pending credit"],
  ["Dep. Acum Equipo de Computo", "Accumulated depreciation of computer equipment"],
  ["DEPRECIACIÓN MUEBLES RECEPCIÓN", "Depreciation of reception furniture"],
  ["DEPRECIACIÓN MESAS DE JUNTA Y", "Depreciation of meeting tables"],
  ["Acreedores diversos a CP", "Short-term sundry creditors"],
  ["PROV. CONTRB.SEG.SOC.POR PAGAR", "Provision for social security contributions payable"],
  ["IMP. ESTATAL S. NÓMINA POR PAGAR", "State payroll tax payable"],
  ["Imp. ret. de ISR serv. prof.", "Income tax withheld on professional services"],
  ["PTU x pagar", "Profit sharing payable"],
  ["Otros impuestos diferidos", "Other deferred taxes"],
  ["Aport. p/ fut.aumentos capital", "Contributions for future capital increases"],
  ["Resul integral de ejerc.anter.", "Comprehensive income from prior years"],
  ["EJERCICIO 2021", "Fiscal year 2021"],
  ["Honorarios PM Res Ext P. R.", "Professional fees to foreign companies (related parties)"],
  ["Gtos no ded (sin requisito fis", "Non-deductible expenses (without tax requirements)"],
  ["Participacion de losTrabajadores en las Utilidades", "Employee profit sharing"],
  ["Ganancia de fondos de inversió", "Gain on investment funds"],
  ["INTERESES A CARGO BANCARIOS", "Bank interest expense"],
];

describe("traducción de cuentas al inglés", () => {
  it("traduce los nombres reales del catálogo, con abreviaturas y truncados", () => {
    for (const [es, en] of CASOS) {
      assert.equal(traducirCuentaAlIngles(es), en, es);
    }
  });

  it("no traduce nombres propios: bancos, clientes, personas, equipos", () => {
    for (const nombre of ["BBVA BANCOMER", "FINAMEX CASA DE BOLSA", "ESMERALDA TAPIA CRUZ", "LAPTOP DELL INSPIRON 5593", "Banco covalto, SA institucion de banca multiple"]) {
      assert.equal(traducirCuentaAlIngles(nombre), null, nombre);
    }
  });

  it("una cabeza conocida seguida de un nombre propio traduce solo la cabeza", () => {
    assert.equal(traducirCuentaAlIngles("LINEA CREDITO BANORTE 87125301"), "Credit line banorte 87125301");
    assert.equal(traducirCuentaAlIngles("Prestamo BBVA 007416900000003313"), "Loan BBVA 007416900000003313");
    assert.equal(traducirCuentaAlIngles("Arrendamiento de Oficina C.S.G"), "Office lease C.S.G");
  });
  it("traduce las cuentas de la empresa de ejemplo, con su etiqueta (sample)", () => {
    const casos: Record<string, string> = {
      "Ventas línea ferretería (ejemplo)": "Hardware line sales (sample)",
      "Ventas línea construcción ligera (ejemplo)": "Light construction line sales (sample)",
      "Costo de ventas (ejemplo)": "Cost of sales (sample)",
      "Sueldos de ventas (ejemplo)": "Sales salaries (sample)",
      "Renta de bodega (ejemplo)": "Warehouse rent (sample)",
      "Caja chica de ejemplo": "Petty cash (sample)",
      "Préstamo bancario de ejemplo": "Bank loan (sample)",
      "Banco Ejemplo, cuenta principal": "Sample Bank, main account",
      "Inventario de mercancía (ejemplo)": "Merchandise inventory (sample)",
      "Luz, agua y teléfono (ejemplo)": "Electricity, water and telephone (sample)",
    };
    for (const [es, en] of Object.entries(casos)) assert.equal(traducirCuentaAlIngles(es), en, es);
  });
});
