import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { mapToMasterWorkbook } from "@/services/ingest/applyMapping";
import { COMPAC_BALANZA_PROFILE } from "@/services/ingest/builtinProfiles";
import { catalogoPendiente } from "@/services/ingest/catalogoPendiente";
import {
  buildResultadosTree,
  collapseToMayorAccounts,
  isMayorCode,
  mayorSegment,
} from "@/services/posicionFinanciera";

/** Balanza estilo Compac: encabezado en la fila 5, datos desde la 7. Cifras evidentemente de ejemplo. */
async function balanzaEjemplo(filas: Array<[string, string, number, number]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Balanza de Comprobación");
  sheet.getRow(1).getCell(1).value = "EMPRESA DE EJEMPLO";
  sheet.getRow(4).getCell(1).value = "C u e n t a";
  sheet.getRow(4).getCell(2).value = "N o m b r e";
  sheet.getRow(5).getCell(5).value = "Cargos";
  sheet.getRow(5).getCell(6).value = "Abonos";
  filas.forEach(([cuenta, nombre, cargos, abonos], index) => {
    const row = sheet.getRow(7 + index);
    row.getCell(1).value = cuenta;
    row.getCell(2).value = nombre;
    row.getCell(5).value = cargos;
    row.getCell(6).value = abonos;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const FILAS: Array<[string, string, number, number]> = [
  ["4101-0000-0000-0000", "Ingresos", 0, 100],
  ["4101-0001-0001-0000", "Ventas tasa general", 0, 100],
];

describe("nombre de la cuenta de mayor en la balanza Compac", () => {
  it("guarda 4101-0000-0000-0000 «Ingresos» en el catálogo y los montos solo en la subcuenta", async () => {
    const { workbook } = await mapToMasterWorkbook({
      buffer: await balanzaEjemplo(FILAS),
      filename: "balanza.xlsx",
      documentType: "balanza",
      sourceSystem: "compac",
      sheetName: null,
      profile: COMPAC_BALANZA_PROFILE,
      periodo: 7,
      anio: 2026,
    });
    assert.deepEqual(workbook.cuentasCatalogo, [{ idCuenta: "4101-0000-0000-0000", nombreCuenta: "Ingresos" }]);
    assert.deepEqual(workbook.balanza.map((fila) => [fila.idCuenta, fila.haber]), [["4101-0001-0001-0000", 100]]);

    const mayorNames: Record<string, string> = {};
    for (const cuenta of workbook.cuentasCatalogo ?? []) {
      if (isMayorCode(cuenta.idCuenta)) mayorNames[mayorSegment(cuenta.idCuenta)] = cuenta.nombreCuenta;
    }
    const tree = buildResultadosTree(
      {
        "2026": workbook.balanza.map(
          (fila) => ({ ...fila, saldoInicial: 0, saldoFinal: 0, montoPresupuestado: 0 }) as unknown as BalanzaPnL,
        ),
      },
      ["2026"],
    );
    const colapsado = collapseToMayorAccounts(tree, ["2026"], (code) => `Cuenta de mayor ${code}`, mayorNames);
    const filasIngreso = colapsado.find((node) => node.id === "pyg:ingresos")?.children ?? [];
    assert.deepEqual(filasIngreso.map((fila) => [fila.label, fila.values["2026"]]), [["Ingresos", 100]]);
  });

  it("un archivo ya confirmado se vuelve a guardar si sus nombres de mayor no están en el catálogo", () => {
    const esperado = [{ idCuenta: "4101-0000-0000-0000", nombreCuenta: "Ingresos" }];
    assert.equal(catalogoPendiente(esperado, []).length, 1);
    assert.equal(catalogoPendiente(esperado, [{ idCuenta: "4101-0000-0000-0000", nombreCuenta: "Otro" }]).length, 1);
    assert.equal(catalogoPendiente(esperado, esperado).length, 0);
    assert.equal(catalogoPendiente(undefined, []).length, 0);
  });
});
