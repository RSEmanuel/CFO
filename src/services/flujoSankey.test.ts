import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { COMPAC_FLUJO_EFECTIVO_PROFILE } from "./ingest/builtinProfiles";
import { parseFlujoEfectivoSheet } from "./ingest/parseFlujoEfectivo";
import type { FlujoLinea } from "./flujoEfectivo";
import { buildFlujoSankey, FLUJO_SANKEY_CAJA } from "./flujoSankey";

const JUL_FIXTURE = path.resolve("Data_ejemplo/03. Flujo de Efectivo 31.07.26.xlsx");

async function loadLineas(excluirTraspasos = true): Promise<{ ingresos: FlujoLinea[]; egresos: FlujoLinea[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(JUL_FIXTURE) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0]!;
  const result = parseFlujoEfectivoSheet(sheet, COMPAC_FLUJO_EFECTIVO_PROFILE, 7, 2026);
  const toLinea = (row: (typeof result.detalle)[number]): FlujoLinea => ({
    categoriaKey: row.categoriaKey,
    label: row.labelOrigen,
    monto: row.monto,
    esTraspaso: row.esTraspaso,
  });
  const ingresos = result.detalle.filter((row) => row.direccion === "ingreso").map(toLinea);
  const egresos = result.detalle.filter((row) => row.direccion === "egreso").map(toLinea);
  if (!excluirTraspasos) {
    return { ingresos, egresos };
  }
  return {
    ingresos: ingresos.filter((linea) => !linea.esTraspaso),
    egresos: egresos.filter((linea) => !linea.esTraspaso),
  };
}

describe("flujo Sankey clásico ingresos → tesorería → egresos", () => {
  it("conecta cada ingreso a Caja y cada egreso desde Caja (jul-2026 sin traspasos)", async () => {
    const { ingresos, egresos } = await loadLineas(true);
    const graph = buildFlujoSankey(ingresos, egresos, "Caja");

    assert.equal(graph.nodes.filter((node) => node.side === "caja").length, 1);
    assert.deepEqual(
      graph.nodes.filter((node) => node.side === "in").map((node) => node.name).sort(),
      ["in:cobranza", "in:diversos", "in:prestamos"].sort(),
    );
    assert.ok(graph.nodes.some((node) => node.name === "out:proveedores"));
    assert.ok(graph.nodes.some((node) => node.name === "out:sueldos"));
    assert.ok(!graph.nodes.some((node) => node.name.includes("traspasos")));
    assert.ok(!graph.nodes.some((node) => node.name.startsWith("hub.")));
    assert.ok(!graph.nodes.some((node) => node.name === "terminal.residual"));

    for (const link of graph.links) {
      if (link.source.startsWith("in:")) {
        assert.equal(link.target, FLUJO_SANKEY_CAJA);
      } else {
        assert.equal(link.source, FLUJO_SANKEY_CAJA);
        assert.ok(link.target.startsWith("out:"));
      }
    }
  });

  it("incluye traspasos de ingreso cuando no se excluyen", async () => {
    const { ingresos, egresos } = await loadLineas(false);
    assert.ok(ingresos.some((linea) => linea.esTraspaso));
    const graph = buildFlujoSankey(ingresos, egresos, "Caja");
    assert.ok(graph.nodes.some((node) => node.name === "in:traspasos"));
    const sinTraspasos = buildFlujoSankey(
      ingresos.filter((linea) => !linea.esTraspaso),
      egresos.filter((linea) => !linea.esTraspaso),
      "Caja",
    );
    assert.ok(!sinTraspasos.nodes.some((node) => node.name.includes("traspasos")));
  });
});
