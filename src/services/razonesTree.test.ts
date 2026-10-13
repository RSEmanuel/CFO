import assert from "node:assert/strict";
import { test } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { getAllMetrics } from "@/services/financialEngine";
import { buildPeriodSnapshot } from "@/services/financialSnapshot";
import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { buildRazonesTree } from "@/services/posicionFinanciera";

/** Cifras evidentemente de ejemplo. */
function fila(idCuenta: string, categoriaMaestra: string, campos: Partial<Record<"saldoFinal" | "debe" | "haber", number>>): BalanzaPnL {
  return {
    idCuenta,
    nombreCuenta: idCuenta,
    categoriaMaestra,
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    periodo: 7,
    anio: 2026,
    ...campos,
  } as unknown as BalanzaPnL;
}

test("los grupos de razones no muestran una suma de razones; sus renglones sí tienen cifra", () => {
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: [
      fila("1102-0001-0001-0000", "Activo", { saldoFinal: 1000 }),
      fila("2101-0001-0001-0000", "Pasivo", { saldoFinal: -400 }),
      fila("4101-0001-0001-0000", "Ingreso", { haber: 2000 }),
      fila("5101-0001-0000-0000", "COGS", { debe: 1200 }),
    ],
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  const tree = buildRazonesTree({ "2026": getAllMetrics(snapshot, null) }, ["2026"]);
  assert.equal(tree.length, 4);
  for (const group of tree) {
    assert.equal(group.values["2026"], null, group.id);
    assert.ok(group.children?.some((child) => child.values["2026"] != null), group.id);
  }
});
