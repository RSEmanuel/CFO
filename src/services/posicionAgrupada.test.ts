import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { buildPosicionTree, groupPosicionByMayor, type StatementNode } from "@/services/posicionFinanciera";

function cuenta(
  idCuenta: string,
  nombreCuenta: string,
  categoriaMaestra: BalanzaPnL["categoriaMaestra"],
  saldoFinal: number,
): BalanzaPnL {
  return {
    idCuenta,
    nombreCuenta,
    categoriaMaestra,
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal,
    depreciacionAmortizacion: false,
    periodo: 12,
    anio: 2026,
  } as unknown as BalanzaPnL;
}

// Cifras de ejemplo (redondas a propósito). Acreedoras en negativo, como la balanza CONTPAQi.
const rows = [
  cuenta("1101-0001-0000-0000", "CAJA CHICA", "Activo", 100),
  cuenta("1102-0001-0001-0000", "BANCO UNO", "Activo", 1_000),
  cuenta("1102-0001-0002-0000", "BANCO DOS", "Activo", 2_000),
  cuenta("1105-0001-0000-0000", "CLIENTE A", "Activo", 300),
  cuenta("1105-0002-0000-0000", "CLIENTE B", "Activo", 400),
  cuenta("2101-0001-0000-0000", "PROVEEDOR A", "Pasivo", -500),
  cuenta("2101-0002-0000-0000", "PROVEEDOR B", "Pasivo", -600),
  cuenta("2113-0001-0000-0000", "ISR POR PAGAR", "Pasivo", -200),
  cuenta("3101-0001-0000-0000", "CAPITAL FIJO", "Patrimonio", -1_000),
  cuenta("3101-0002-0000-0000", "CAPITAL VARIABLE", "Patrimonio", -500),
  cuenta("3102-0001-0000-0000", "APORTACION SOCIO A", "Patrimonio", -500),
  cuenta("3103-0001-0000-0000", "RESERVA LEGAL", "Patrimonio", -500),
];

const years = ["2026"];
const tree = buildPosicionTree({ "2026": rows }, years);
const grouped = groupPosicionByMayor(tree, years, (segment) => `Cuenta de mayor ${segment}`, {
  "1102": "BANCOS",
  "1105": "CLIENTES",
  "2101": "Proveedores",
  "3101": "Capital social",
});

function find(nodes: StatementNode[], id: string): StatementNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children ? find(node.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

const summary = (node: StatementNode | undefined) =>
  node?.children?.map((child) => [child.label, child.values["2026"], child.children?.length ?? 0]);

describe("Estado de posición agrupado por cuenta de mayor", () => {
  it("el activo junta bancos y clientes; una mayor con una sola cuenta queda como esa cuenta", () => {
    assert.deepEqual(summary(find(grouped, "epf:activo-cp")), [
      ["CAJA CHICA", 100, 0],
      ["BANCOS", 3_000, 2],
      ["CLIENTES", 700, 2],
    ]);
  });

  it("el pasivo junta proveedores en signo económico", () => {
    assert.deepEqual(summary(find(grouped, "epf:pasivo-cp")), [
      ["Proveedores", 1_100, 2],
      ["ISR POR PAGAR", 200, 0],
    ]);
  });

  it("el capital agrupa por mayor dentro de cada rubro y no agrega nivel si el rubro tiene una sola mayor", () => {
    assert.deepEqual(summary(find(grouped, "epf:capital-social")), [
      ["Capital social", 1_500, 2],
      ["APORTACION SOCIO A", 500, 0],
    ]);
    assert.deepEqual(summary(find(grouped, "epf:capital-reservas")), [["RESERVA LEGAL", 500, 0]]);
  });

  it("un rubro con una sola mayor con saldo no repite el nivel aunque otra mayor venga en cero", () => {
    const conCero = [
      ...rows.filter((row) => !row.idCuenta.startsWith("3102")),
      cuenta("3102-0001-0000-0000", "APORTACION SOCIO A", "Patrimonio", 0),
      cuenta("3102-0002-0000-0000", "APORTACION SOCIO B", "Patrimonio", 0),
    ];
    const base = buildPosicionTree({ "2026": conCero }, years);
    const agrupado = groupPosicionByMayor(base, years, (segment) => segment, { "3101": "Capital social" });
    assert.deepEqual(find(agrupado, "epf:capital-social"), find(base, "epf:capital-social"));
  });

  it("sin nombre en el catálogo usa el texto de respaldo, nunca el de una subcuenta", () => {
    const sinNombres = groupPosicionByMayor(tree, years, (segment) => `Cuenta de mayor ${segment}`);
    assert.equal(find(sinNombres, "epf:activo-cp:mayor:1102")?.label, "Cuenta de mayor 1102");
  });

  it("los totales y la identidad A = P + C no cambian", () => {
    for (const id of ["epf:activo", "epf:activo-cp", "epf:pasivo", "epf:pasivo-cp", "epf:capital", "epf:control"]) {
      assert.deepEqual(find(grouped, id)?.values, find(tree, id)?.values, id);
    }
    assert.equal(find(grouped, "epf:activo")?.values["2026"], 3_800);
    assert.equal(find(grouped, "epf:control")?.values["2026"], 3_800);
  });

  it("códigos sin separador no se agrupan: el árbol queda igual", () => {
    const planos = [
      cuenta("110201", "BANCO UNO", "Activo", 10),
      cuenta("110202", "BANCO DOS", "Activo", 20),
      cuenta("310101", "CAPITAL", "Patrimonio", -30),
    ];
    const base = buildPosicionTree({ "2026": planos }, years);
    assert.deepEqual(groupPosicionByMayor(base, years, (segment) => segment), base);
  });
});
