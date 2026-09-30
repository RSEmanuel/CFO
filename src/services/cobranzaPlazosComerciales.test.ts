import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { cccFromBalanza } from "@/services/capitalTrabajoCalcs";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import {
  brechaKind,
  formatPlazoDias,
  plazosComercialesFromCcc,
} from "@/services/cobranzaPlazosComerciales";

function balanzaRow(overrides: {
  idCuenta: string;
  nombreCuenta?: string;
  categoriaMaestra?: BalanzaPnL["categoriaMaestra"];
  saldoInicial?: number;
  debe?: number;
  haber?: number;
  saldoFinal?: number;
}): BalanzaPnL {
  return {
    nombreCuenta: overrides.nombreCuenta ?? overrides.idCuenta,
    categoriaMaestra: overrides.categoriaMaestra ?? "Activo",
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
    ...overrides,
  } as unknown as BalanzaPnL;
}

describe("plazosComercialesFromCcc: guardas de división por cero", () => {
  it("ventas anualizadas ≤ 0 → DSO N/D (no 0 inventado); COGS válido → DPO numérico", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 0,
      dpo: 15.21,
      ventasAnualizadas: 0,
      cogsAnualizado: 72_000,
    });
    assert.equal(plazos.dso, null);
    assert.equal(plazos.dpo, 15.21);
    assert.equal(plazos.brecha, null);
  });

  it("COGS anualizado ≤ 0 → DPO N/D; ventas válidas → DSO numérico y brecha N/D", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 5.07,
      dpo: 0,
      ventasAnualizadas: 144_000,
      cogsAnualizado: 0,
    });
    assert.equal(plazos.dso, 5.07);
    assert.equal(plazos.dpo, null);
    assert.equal(plazos.brecha, null);
  });

  it("ambos flujos 0 → DSO, DPO y brecha N/D", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 0,
      dpo: 0,
      ventasAnualizadas: 0,
      cogsAnualizado: 0,
    });
    assert.deepEqual(plazos, { dso: null, dpo: null, brecha: null });
  });

  it("flujo por debajo del epsilon (0.01) se trata como cero", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 12,
      dpo: 8,
      ventasAnualizadas: 0.01,
      cogsAnualizado: 0.005,
    });
    assert.equal(plazos.dso, null);
    assert.equal(plazos.dpo, null);
    assert.equal(plazos.brecha, null);
  });
});

describe("plazosComercialesFromCcc: signo de la brecha", () => {
  it("DSO > DPO → brecha positiva (déficit de plazo comercial)", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 196.84,
      dpo: 108.23,
      ventasAnualizadas: 1,
      cogsAnualizado: 1,
    });
    assert.equal(plazos.brecha, 88.61);
    assert.equal(brechaKind(plazos.brecha), "deficit");
  });

  it("DSO < DPO → brecha negativa (superávit: proveedores financian más)", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 30,
      dpo: 45.5,
      ventasAnualizadas: 1,
      cogsAnualizado: 1,
    });
    assert.equal(plazos.brecha, -15.5);
    assert.equal(brechaKind(plazos.brecha), "superavit");
  });

  it("DSO = DPO → brecha 0 y superávit (no hay déficit de plazo)", () => {
    const plazos = plazosComercialesFromCcc({
      dso: 40,
      dpo: 40,
      ventasAnualizadas: 1,
      cogsAnualizado: 1,
    });
    assert.equal(plazos.brecha, 0);
    assert.equal(brechaKind(plazos.brecha), "superavit");
  });

  it("brecha N/D no clasifica", () => {
    assert.equal(brechaKind(null), null);
  });
});

describe("formatPlazoDias", () => {
  it("formatea a 2 decimales y N/D cuando falta el valor", () => {
    assert.equal(formatPlazoDias(196.84), "196.84");
    assert.equal(formatPlazoDias(108.2), "108.20");
    assert.equal(formatPlazoDias(5), "5.00");
    assert.equal(formatPlazoDias(null), "N/D");
    assert.equal(formatPlazoDias(undefined), "N/D");
    assert.equal(formatPlazoDias(Number.NaN, "—"), "—");
  });
});

describe("plazosComercialesFromCcc: reusa cccFromBalanza (denominadores 4xxx/5xxx)", () => {
  it("mismo DSO/DPO que el canónico mensual y brecha = DSO − DPO", () => {
    const rows = [
      balanzaRow({
        idCuenta: "1105-0001-0001-0000",
        nombreCuenta: "CLIENTE A",
        saldoInicial: 1000,
        saldoFinal: 3000,
      }),
      balanzaRow({
        idCuenta: "2101-0001-0001-0000",
        nombreCuenta: "PROVEEDOR A",
        categoriaMaestra: "Pasivo",
        saldoInicial: -2000,
        saldoFinal: -4000,
      }),
      balanzaRow({
        idCuenta: "4101-0001-0001-0000",
        nombreCuenta: "VENTAS",
        categoriaMaestra: "Ingreso",
        haber: 12000,
      }),
      balanzaRow({
        idCuenta: "5101-0001-0000-0000",
        nombreCuenta: "COSTO DE VENTAS",
        categoriaMaestra: "COGS",
        debe: 6000,
      }),
    ];
    const ccc = cccFromBalanza({
      balanzaCierre: rows,
      balanzaMov: rows,
      roles: COMPAC_ACCOUNT_ROLES,
    });
    const plazos = plazosComercialesFromCcc(ccc);
    assert.equal(ccc.dso, 5.07);
    assert.equal(ccc.dpo, 15.21);
    assert.equal(plazos.dso, 5.07);
    assert.equal(plazos.dpo, 15.21);
    assert.equal(plazos.brecha, -10.14);
    assert.equal(brechaKind(plazos.brecha), "superavit");
  });
});
