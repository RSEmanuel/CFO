import ExcelJS from "exceljs";

/**
 * Archivos de ejemplo armados en memoria para las pruebas de caracterización
 * de la ingesta. Imitan el acomodo de los reportes CONTPAQi y de la plantilla
 * de Cifra, pero los datos son evidentemente de ejemplo ("Empresa Demo",
 * montos redondos). Ejercitan a propósito lo que un lector nuevo podría leer
 * distinto: celdas combinadas, fórmulas con resultado, texto enriquecido,
 * fechas como texto y como fecha de Excel, filas vacías y pies de reporte.
 */

export type FixtureSintetico = {
  nombre: string;
  filename: string;
  build: () => Promise<Buffer>;
};

const FECHA_FIJA = new Date(Date.UTC(2026, 0, 1));

async function toBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cifra pruebas";
  wb.created = FECHA_FIJA;
  wb.modified = FECHA_FIJA;
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function plantillaMaster(wb: ExcelJS.Workbook) {
  const balanza = wb.addWorksheet("balanza_pnl");
  balanza.addRow([
    "id_cuenta",
    "nombre_cuenta",
    "categoria_maestra",
    "saldo_inicial",
    "debe",
    "haber",
    "saldo_final",
    "monto_presupuestado",
    "depreciacion_amortizacion",
    "periodo",
    "anio",
  ]);
  balanza.addRow(["1101", "Bancos Demo", "Activo", 100, 50, 50, 100, 0, false, 7, 2026]);
  balanza.addRow(["2101", "Proveedores Demo", "Pasivo", 100, 50, 50, 100, 0, false, 7, 2026]);
  balanza.addRow(["4101", "Ventas Demo", "Ingreso", 0, 0, 100, -100, 120, false, 7, 2026]);

  const ventas = wb.addWorksheet("auxiliar_ventas");
  ventas.addRow([
    "id_cliente",
    "nombre_cliente",
    "folio_factura",
    "fecha_emision",
    "fecha_vencimiento",
    "monto_subtotal",
    "iva",
    "monto_cobrado",
    "estatus_pago",
    "linea_negocio",
  ]);
  ventas.addRow(["C1", "Cliente Demo", "F-1", new Date(Date.UTC(2026, 6, 2)), new Date(Date.UTC(2026, 7, 1)), 100, 16, 116, "Pagado", "Demo"]);

  const egresos = wb.addWorksheet("auxiliar_egresos");
  egresos.addRow([
    "id_proveedor",
    "nombre_proveedor",
    "folio_documento",
    "fecha_emision",
    "fecha_vencimiento",
    "monto_subtotal",
    "centro_de_costos",
    "clasificacion_gasto",
    "tipo_inversion",
    "estatus_pago",
  ]);
  egresos.addRow(["P1", "Proveedor Demo", "E-1", new Date(Date.UTC(2026, 6, 3)), new Date(Date.UTC(2026, 6, 20)), 80, "Admin", "Fijo", "OpEx", "Pagado"]);

  const tesoreria = wb.addWorksheet("tesoreria_flujo");
  tesoreria.addRow([
    "id_banco_caja",
    "saldo_inicial_periodo",
    "entradas_operativas",
    "salidas_operativas",
    "salidas_capex",
    "servicio_deuda",
    "saldo_final_periodo",
    "periodo",
    "anio",
  ]);
  tesoreria.addRow(["1101", 100, 50, 50, 0, 0, 100, 7, 2026]);
}

function compacBalanza(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet("Balanza de Comprobación");
  sheet.addRow(["Empresa Demo SA de CV"]);
  sheet.addRow(["Balanza de comprobación al 31/Jul/2026"]);
  sheet.addRow([]);
  sheet.addRow(["C u e n t a", "N o m b r e", "Saldos Iniciales", "", "", "", "Saldos Actuales", ""]);
  sheet.mergeCells("C4:D4");
  sheet.mergeCells("G4:H4");
  sheet.addRow(["", "", "Deudor", "Acreedor", "Cargos", "Abonos", "Deudor", "Acreedor"]);
  sheet.addRow([]);
  sheet.addRow(["1102-0000-0000-0000", "BANCOS", 100, 0, 80, 30, 150, 0]);
  sheet.addRow(["1102-0001-0001-0000", { richText: [{ text: "Banco " }, { text: "Demo" }] }, 100, 0, 80, 30, 150, 0]);
  sheet.addRow(["2101-0001-0001-0000", "Proveedor Demo", 0, 50, 20, 0, 0, 30]);
  sheet.addRow(["4101-0001-0000-0000", "Ventas Demo", 0, 0, 0, 100, 0, 100]);
  const costo = sheet.addRow(["5101-0001-0000-0000", "Costo de ventas", 0, 0, 0, 0, 50, 0]);
  costo.getCell(5).value = { formula: "25+25", result: 50 };
  sheet.addRow(["6101-0001-0000-0000", "Depreciación de equipo demo", 0, 0, 10, 0, 10, 0]);
  sheet.addRow([]);
  sheet.addRow(["", "Totales", 200, 50, 160, 130, 360, 130]);
  for (let index = 1; index <= 3; index += 1) {
    sheet.addRow([`Pie de reporte ${index}`]);
  }
}

function compacFlujo(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet("Flujo de Efectivo");
  sheet.addRow(["Empresa Demo SA de CV"]);
  sheet.addRow(["Flujo de efectivo del 01/Jul/2026 al 31/Jul/2026"]);
  sheet.addRow([]);
  sheet.addRow(["", "M o v i m i e n t o s", "S a l d o s"]);
  sheet.addRow(["1000-0000 BANCOS DEMO"]);
  sheet.addRow(["Saldo inicial", "", 5000]);
  sheet.addRow(["Ingresos"]);
  sheet.addRow(["Ingr Ventas mostrador", 1200]);
  sheet.addRow(["Ingr Traspaso entre cuentas", 300]);
  sheet.addRow(["Total Ingresos", 1500]);
  sheet.addRow(["D i s p o n i b l e", "", 6500]);
  sheet.addRow(["Egresos"]);
  sheet.addRow(["Egr Compras", 800]);
  sheet.addRow(["Egr Concepto nuevo demo", 200]);
  sheet.addRow(["Total Egresos", 1000]);
  sheet.addRow(["S a l d o    f i n a l", "", 5500]);
  sheet.addRow([]);
  sheet.addRow(["2000-0000 CAJA DEMO"]);
  sheet.addRow(["Saldo inicial", "", 100]);
  sheet.addRow(["Ingresos"]);
  sheet.addRow(["Ingr Ventas mostrador", 50]);
  sheet.addRow(["Total Ingresos", 50]);
  sheet.addRow(["D i s p o n i b l e", "", 150]);
  sheet.addRow(["Egresos"]);
  sheet.addRow(["Egr Traspaso entre cuentas", 300]);
  sheet.addRow(["Total Egresos", 300]);
  sheet.addRow(["S a l d o    f i n a l", "", -150]);
}

function compacAuxiliar(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet("Reporte de COMPAC");
  sheet.addRow(["Empresa Demo SA de CV"]);
  sheet.addRow(["Auxiliares del catálogo"]);
  sheet.addRow(["Fecha: 25/Ago/2026"]);
  sheet.addRow(["Del 01/Jul/2026 al 31/Jul/2026"]);
  sheet.addRow(["Moneda: Peso Mexicano"]);
  sheet.addRow([]);
  sheet.addRow(["Fecha", "Tipo", "Número", "Concepto", "Referencia", "Cargos", "Abonos", "Saldo"]);
  sheet.addRow(["1105-0000-0000-0000", "CLIENTES", "", "", "", "", "Saldo inicial :", 200]);
  sheet.addRow(["1105-0001-0001-0000", "Cliente Demo Uno", "", "", "", "", "Saldo inicial :", 200]);
  sheet.addRow(["02/Jul/2026", "Ingresos", "1", "Cobro factura demo", "F-1", 0, 50, 150]);
  sheet.addRow([new Date(Date.UTC(2026, 6, 15)), "Diario", "2", "Venta demo", "F-2", 100, 0, 250]);
  sheet.addRow(["", "", "", "", "Total:", 100, 50, 250]);
  sheet.addRow(["2101-0001-0001-0000", "Proveedor Demo", "", "", "", "", "Saldo inicial :", -80]);
  sheet.addRow(["03/Jul/2026", "Egresos", "3", "Pago demo", "E-1", 80, 0, 0]);
  sheet.addRow(["04/Ago/2026", "Diario", "4", "Movimiento fuera de periodo demo", "", 0, 20, -20]);
  sheet.addRow(["", "", "", "", "Total:", 80, 20, -20]);
  sheet.addRow(["6101-0001-0000-0000", "Gasto Demo", "", "", "", "", "Saldo inicial :", 0]);
  sheet.addRow(["10/Jul/2026", "Diario", "5", "Gasto demo", "G-1", 40, 0, 40]);
  sheet.addRow(["", "", "", "", "Total:", 45, 0, 45]);
  sheet.addRow([]);
  sheet.addRow(["", "", "", "", "Total general:", 225, 70, 275]);
}

function compacPolizas(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet("Diarios y Pólizas");
  sheet.addRow(["Empresa Demo SA de CV"]);
  sheet.addRow(["Impreso de pólizas del 01/Jul/2026 al 31/Jul/2026"]);
  sheet.addRow(["Moneda: Peso Mexicano"]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow(["Fecha", "Tipo", "Número", "Concepto"]);
  sheet.addRow(["No.", "Refer.", "Cuenta", "Nombre", null, null, "Cargos", "Abonos"]);
  sheet.addRow(["01/Jul/2026", "Ingresos", 1, "Cobranza demo"]);
  sheet.addRow([1, "F-1", "1102-0001-0001-0000", "Banco Demo", null, null, 116, null]);
  sheet.addRow([null, null, null, "Cobro de factura demo"]);
  sheet.addRow([2, "F-1", "1105-0001-0001-0000", "Cliente Demo", null, null, null, 116]);
  sheet.addRow([null, "Cifra de Control", null, null, null, "Total póliza :", 116, 116]);
  sheet.addRow(["Total al 01/Jul/2026 :", null, null, null, null, null, 116, 116]);
  sheet.addRow([]);
  sheet.addRow(["02/Jul/2026", "Diario", 1, "Provisión demo"]);
  sheet.addRow([1, "", "6101-0001-0000-0000", "Gasto Demo", null, null, 100, null]);
  sheet.addRow([2, "", "2101-0001-0001-0000", "Proveedor Demo", null, null, null, 90]);
  sheet.addRow([null, "Cifra de Control", null, null, null, "Total póliza :", 100, 90]);
  sheet.addRow(["03/Jul/2026", "Nómina", 2026, "CFDI asociado demo"]);
  sheet.addRow([null, "UUID", null, "00000000-0000-0000-0000-000000000000"]);
  sheet.addRow([null, null, null, "Complemento de pago demo"]);
  sheet.addRow(["T o t a l   G e n e r a l :", null, null, null, null, null, 216, 206]);
  sheet.addRow(["Total de pólizas impresas : 2"]);
  sheet.addRow(["Total de movimientos impresos : 4"]);
}

function desconocido(wb: ExcelJS.Workbook) {
  const sheet = wb.addWorksheet("Notas");
  sheet.addRow(["hola", "mundo"]);
  sheet.addRow(["1", "2"]);
}

export const FIXTURES_SINTETICOS: FixtureSintetico[] = [
  { nombre: "plantilla-master", filename: "plantilla_demo.xlsx", build: () => toBuffer(plantillaMaster) },
  { nombre: "compac-balanza", filename: "archivo_sin_pistas.xlsx", build: () => toBuffer(compacBalanza) },
  { nombre: "compac-flujo", filename: "flujo_demo.xlsx", build: () => toBuffer(compacFlujo) },
  { nombre: "compac-auxiliar", filename: "auxiliar_demo.xlsx", build: () => toBuffer(compacAuxiliar) },
  { nombre: "compac-polizas", filename: "polizas_demo.xlsx", build: () => toBuffer(compacPolizas) },
  { nombre: "desconocido", filename: "notas.xlsx", build: () => toBuffer(desconocido) },
];
