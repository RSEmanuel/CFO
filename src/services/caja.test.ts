import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cajaDeBalanza, cajaYRespiro, gastoMensualDeOperacion, mesesDeRespiro } from "@/services/caja";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";

/** Cifras evidentemente de ejemplo. */
function fila(idCuenta: string, nombreCuenta: string, campos: { saldoFinal?: number; debe?: number; haber?: number; periodo?: number; categoriaMaestra?: string }) {
  return {
    idCuenta,
    nombreCuenta,
    categoriaMaestra: campos.categoriaMaestra ?? "Activo",
    saldoFinal: campos.saldoFinal ?? 0,
    debe: campos.debe ?? 0,
    haber: campos.haber ?? 0,
    periodo: campos.periodo ?? 7,
  };
}

describe("tu caja: una sola regla desde la balanza", () => {
  it("suma caja y bancos por prefijo aunque el nombre no diga banco", () => {
    const rows = [
      fila("1101-0001-0000-0000", "CAJA CHICA", { saldoFinal: 100 }),
      fila("1102-0001-0001-0000", "BANCO EJEMPLO", { saldoFinal: 1000 }),
      fila("1102-0001-0002-0000", "EJEMPLO SIN LA PALABRA", { saldoFinal: 10 }),
    ];
    assert.deepEqual(cajaDeBalanza(rows, COMPAC_ACCOUNT_ROLES), { caja: 1110, cuentas: 3 });
  });

  it("un cliente llamado BANCO o CAJA POPULAR es cuenta por cobrar, no caja", () => {
    const rows = [
      fila("1102-0001-0001-0000", "BANCO EJEMPLO", { saldoFinal: 1000 }),
      fila("1105-0001-0001-0000", "BANCO CLIENTE EJEMPLO", { saldoFinal: 5000 }),
      fila("1105-0001-0002-0000", "CAJA POPULAR EJEMPLO", { saldoFinal: 7000 }),
      fila("1108-0003-0000-0000", "ISR RETENIDO POR BANCOS", { saldoFinal: 300 }),
    ];
    assert.equal(cajaDeBalanza(rows, COMPAC_ACCOUNT_ROLES).caja, 1000);
  });

  it("con padres persistidos no cuenta doble", () => {
    const rows = [
      fila("1102-0000", "BANCOS", { saldoFinal: 1000 }),
      fila("1102-0001", "BANCO EJEMPLO", { saldoFinal: 1000 }),
    ];
    assert.equal(cajaDeBalanza(rows, COMPAC_ACCOUNT_ROLES).caja, 1000);
  });

  it("otro catálogo sin esos prefijos: cae a los nombres bajo el padre Bancos", () => {
    const rows = [
      fila("A10-00", "Bancos", { saldoFinal: 900 }),
      fila("A10-01", "Cuenta ejemplo uno", { saldoFinal: 400 }),
      fila("A10-02", "Cuenta ejemplo dos", { saldoFinal: 500 }),
      fila("A20-00", "Clientes", { saldoFinal: 50 }),
      fila("A20-01", "Banco cliente ejemplo", { saldoFinal: 50 }),
    ];
    assert.equal(cajaDeBalanza(rows, null).caja, 900);
  });
});

describe("meses de respiro", () => {
  it("gasto mensual = costo + gastos sin depreciación + gastos financieros + ISR y PTU", () => {
    const er = { costo: 100, totalOpex: 60, da: 10, gastosFinancieros: 5, ptu: 2, isr: 3 } as Parameters<typeof gastoMensualDeOperacion>[0];
    assert.equal(gastoMensualDeOperacion(er), 160);
  });

  it("es tu caja ÷ gasto mensual; sin gasto no hay ritmo: null", () => {
    assert.equal(mesesDeRespiro(300, 200), 1.5);
    assert.equal(mesesDeRespiro(300, 0), null);
    assert.equal(mesesDeRespiro(-50, 200), 0);
  });

  it("promedia hasta 3 meses del PyG e ignora meses posteriores", () => {
    const cierre = [fila("1102-0001", "BANCO EJEMPLO", { saldoFinal: 600, periodo: 7 })];
    const historial = [
      ...cierre,
      fila("5101", "COSTO EJEMPLO", { debe: 100, periodo: 4, categoriaMaestra: "COGS" }),
      fila("5101", "COSTO EJEMPLO", { debe: 200, periodo: 5, categoriaMaestra: "COGS" }),
      fila("5101", "COSTO EJEMPLO", { debe: 300, periodo: 6, categoriaMaestra: "COGS" }),
      fila("5101", "COSTO EJEMPLO", { debe: 400, periodo: 7, categoriaMaestra: "COGS" }),
      fila("5101", "COSTO EJEMPLO", { debe: 9000, periodo: 8, categoriaMaestra: "COGS" }),
    ];
    const r = cajaYRespiro({ periodo: 7, balanzaCierre: cierre, balanzaHistorial: historial, roles: COMPAC_ACCOUNT_ROLES });
    assert.equal(r.gastoMensual, 300);
    assert.equal(r.mesesRitmo, 3);
    assert.equal(r.mesesDeRespiro, 2);
  });

  it("sin cuentas de caja no hay meses de respiro", () => {
    const cierre = [fila("5101", "COSTO EJEMPLO", { debe: 100, categoriaMaestra: "COGS" })];
    const r = cajaYRespiro({ periodo: 7, balanzaCierre: cierre, roles: COMPAC_ACCOUNT_ROLES });
    assert.equal(r.cuentas, 0);
    assert.equal(r.mesesDeRespiro, null);
  });
});
