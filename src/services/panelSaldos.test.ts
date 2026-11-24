import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { saldosComercialesCierre } from "./capitalTrabajoCalcs";
import { buildPanelSaldos, impuestosPorPagar } from "./panelSaldos";

function cuenta(idCuenta: string, nombreCuenta: string, categoriaMaestra: BalanzaPnL["categoriaMaestra"], saldoFinal: number): BalanzaPnL {
  return {
    idCuenta,
    nombreCuenta,
    categoriaMaestra,
    saldoInicial: saldoFinal,
    debe: 0,
    haber: 0,
    saldoFinal,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
  } as unknown as BalanzaPnL;
}

// Cifras de ejemplo, redondas a propósito. Acreedoras en negativo, como CONTPAQi.
const balanza = [
  cuenta("1101-0001-0000-0000", "CAJA CHICA", "Activo", 100),
  cuenta("1105-0001-0001-0000", "CLIENTE A", "Activo", 3000),
  cuenta("1108-0005-0000-0000", "IVA RETENIDO POR CLIENTES", "Activo", 50),
  cuenta("2101-0001-0001-0000", "PROVEEDOR A", "Pasivo", -2000),
  cuenta("2106-0001-0000-0000", "LINEA CREDITO BANCO", "Pasivo", -5000),
  cuenta("2108-0001-0000-0000", "IVA TRASLADADO COBRADO", "Pasivo", -200),
  cuenta("2109-0001-0000-0000", "IVA TRASLADADO NO COBRADO", "Pasivo", -300),
  cuenta("2113-0003-0000-0000", "ISR POR PAGAR", "Pasivo", -400),
  // Cuadra A = −(P + C) para que la convención de signo se detecte como en una balanza real.
  cuenta("3101-0001-0000-0000", "CAPITAL", "Patrimonio", 4750),
];

describe("saldos del Panel de Control", () => {
  it("clientes y proveedores por prefijo: «IVA retenido por clientes» no es cliente", () => {
    assert.deepEqual(saldosComercialesCierre(balanza), { cxc: 3000, cxp: 2000 });
  });

  it("impuestos por pagar en signo económico, con el IVA no cobrado aparte", () => {
    assert.deepEqual(impuestosPorPagar(balanza), { total: 900, ivaPorCobrar: 300 });
  });

  it("deuda financiera del rol y deuda neta contra tu caja", () => {
    const panel = buildPanelSaldos({ anio: 2026, mes: 7, balanzaYtd: balanza });
    assert.equal(panel.hasBalanza, true);
    assert.equal(panel.deuda, 5000);
    assert.equal(panel.deudaNeta, 4900);
  });

  it("sin balanza del mes todo es null", () => {
    const panel = buildPanelSaldos({ anio: 2026, mes: 8, balanzaYtd: balanza });
    assert.equal(panel.hasBalanza, false);
    assert.equal(panel.cxc, null);
  });
});
