import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { buildResultadosTree, type StatementNode } from "@/services/posicionFinanciera";

/** Cifras evidentemente de ejemplo. */
function fila(
  idCuenta: string,
  nombreCuenta: string,
  categoriaMaestra: string,
  debe: number,
  haber: number,
): BalanzaPnL {
  return {
    idCuenta,
    nombreCuenta,
    categoriaMaestra,
    saldoInicial: 0,
    debe,
    haber,
    saldoFinal: debe - haber,
    depreciacionAmortizacion: false,
    periodo: 1,
    anio: 2026,
  } as unknown as BalanzaPnL;
}

function codigos(node: StatementNode | undefined): string[] {
  if (!node) return [];
  if (!node.children?.length) return node.code ? [node.code] : [];
  return node.children.flatMap(codigos);
}

describe("Gastos financieros del Estado de resultados", () => {
  const filas = [
    fila("4101-0001-0000-0000", "VENTAS EJEMPLO", "Ingreso", 0, 100),
    fila("7102-0010-0000-0000", "Otros productos financieros", "Ingreso", 0, 50),
    fila("8101-0002-0000-0000", "INTERESES A CARGO EJEMPLO", "OpEx", 30, 0),
    // Cuentas de balance cuyo nombre trae «financiero»: un banco, un cliente y un acreedor.
    fila("1102-0001-0019-0000", "BANCO EJEMPLO GRUPO FINANCIERO", "Activo", 7, 0),
    fila("1105-0001-0032-0000", "CLIENTE EJEMPLO SERVICIOS FINANCIEROS", "Activo", 0, 3),
    fila("2105-0007-0000-0000", "ACREEDOR EJEMPLO SEGUROS FINANCIEROS", "Pasivo", 0, 11),
  ];
  const tree = buildResultadosTree({ "2026": filas }, ["2026"]);
  const fin = tree.find((node) => node.id === "pyg:fin");

  it("no incluye cuentas de balance aunque su nombre diga «financiero»", () => {
    assert.deepEqual(codigos(fin), ["8101-0002-0000-0000"]);
    assert.equal(fin?.values["2026"], 30);
  });

  it("un producto financiero cuenta una sola vez, en ingresos", () => {
    assert.equal(tree.find((node) => node.id === "pyg:ingresos")?.values["2026"], 150);
    assert.ok(!codigos(fin).includes("7102-0010-0000-0000"));
  });

  it("la utilidad neta no cambia por movimientos de cuentas de balance", () => {
    assert.equal(tree.find((node) => node.id === "pyg:un")?.values["2026"], 120);
  });
});
