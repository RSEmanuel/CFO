import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEstadoOperativo,
  classifyErCuenta,
  type ErCuentaRow,
  type ErRowKey,
} from "@/services/estadoOperativo";

function row(overrides: Partial<ErCuentaRow> & { idCuenta: string }): ErCuentaRow {
  return {
    nombreCuenta: overrides.idCuenta,
    debe: 0,
    haber: 0,
    ...overrides,
  };
}

function byKey(estado: ReturnType<typeof buildEstadoOperativo>) {
  return Object.fromEntries(estado.filas.map((fila) => [fila.key, fila]));
}

test("classifyErCuenta: prefijos del catálogo Compac y catch-alls por primer dígito", () => {
  assert.equal(classifyErCuenta("4101-0001-0001-0000"), "ventas");
  assert.equal(classifyErCuenta("4201-0001-0000-0000"), "ventas");
  assert.equal(classifyErCuenta("5101-0001-0000-0000"), "costo");
  assert.equal(classifyErCuenta("6101-0001-0000-0000"), "gastosVenta");
  assert.equal(classifyErCuenta("6201-0055-0000-0000"), "gastosAdmin");
  assert.equal(classifyErCuenta("6301-0004-0000-0000"), "daContable");
  assert.equal(classifyErCuenta("6405-0001-0000-0000"), "ptu");
  assert.equal(classifyErCuenta("6406-0001-0000-0000"), "isr");
  assert.equal(classifyErCuenta("7102-0001-0000-0000"), "productosFinancieros");
  assert.equal(classifyErCuenta("7104-0023-0000-0000"), "productosFinancieros");
  assert.equal(classifyErCuenta("8101-0002-0000-0000"), "gastosFinancieros");
  // catch-alls: 6xxx/7xxx/8xxx no listados explícitamente
  assert.equal(classifyErCuenta("6401-0001"), "otrosOperativos");
  assert.equal(classifyErCuenta("7201-0001"), "productosFinancieros");
  assert.equal(classifyErCuenta("8201-0001"), "gastosFinancieros");
  // balance y fuera de PyG → null
  assert.equal(classifyErCuenta("1102-0001-0000-0000"), null);
  assert.equal(classifyErCuenta("1202-0001-0000-0000"), null);
  assert.equal(classifyErCuenta("2101-0001-0000-0000"), null);
  assert.equal(classifyErCuenta("3101-0001-0000-0000"), null);
  assert.equal(classifyErCuenta(""), null);
});

test("classifyErCuenta: remapeo a catálogo SAT corto (401/501/601/701/702) vía primer segmento", () => {
  // Con los prefijos por defecto, 601 cae al catch-all de 6xxx; la clase
  // específica depende de ER_PREFIXES, pero el catch-all nunca rompe el cuadre.
  assert.equal(classifyErCuenta("401-01-001"), "ventas");
  assert.equal(classifyErCuenta("501-01-001"), "costo");
  assert.equal(classifyErCuenta("601-01-001"), "otrosOperativos");
  assert.equal(classifyErCuenta("701-01-001"), "productosFinancieros");
  assert.equal(classifyErCuenta("702-01-001"), "productosFinancieros");
});

const ER_ORDER: ErRowKey[] = [
  "ventas",
  "costo",
  "utilidadBruta",
  "gastosVenta",
  "gastosAdmin",
  "daContable",
  "otrosOperativos",
  "totalOpex",
  "ebit",
  "daReintegro",
  "ebitda",
  "rif",
  "productosFinancieros",
  "gastosFinancieros",
  "ebt",
  "ptu",
  "isr",
  "utilidadNeta",
];

test("buildEstadoOperativo: estructura fija de 18 líneas con niveles de indentación", () => {
  const estado = buildEstadoOperativo({ acumulado: [], mesActual: [], mesAnterior: [] });
  assert.deepEqual(
    estado.filas.map((fila) => fila.key),
    ER_ORDER,
  );
  const rows = byKey(estado);
  assert.equal(rows.rif.level, 0);
  assert.equal(rows.productosFinancieros.level, 1);
  assert.equal(rows.gastosFinancieros.level, 1);
  assert.equal(rows.daReintegro.level, 1);
  assert.equal(rows.ptu.level, 1);
  assert.equal(rows.isr.level, 1);
  assert.equal(rows.utilidadNeta.role, "result");
  assert.equal(rows.totalOpex.role, "total");
});

test("signos por naturaleza: ventas haber−debe (devoluciones restan), costos y gastos debe−haber", () => {
  const actual = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 1000 }),
    row({ idCuenta: "4201-0001-0000-0000", nombreCuenta: "Devoluciones sobre ventas", debe: 60 }),
    row({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo de ventas", debe: 300 }),
    row({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "Sueldos", debe: 100 }),
  ];
  const estado = buildEstadoOperativo({ acumulado: actual, mesActual: actual, mesAnterior: [] });
  const rows = byKey(estado);
  assert.equal(rows.ventas.mesActual.monto, 940);
  assert.equal(rows.costo.mesActual.monto, 300);
  assert.equal(rows.utilidadBruta.mesActual.monto, 640);
  assert.equal(rows.gastosVenta.mesActual.monto, 100);
  assert.equal(rows.ebit.mesActual.monto, 540);
});

test("EBITDA = EBIT + D&A: 6301 + D&A por nombre en 6101/6201, SIN cuentas de balance 1200/1202", () => {
  const actual = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 2000 }),
    row({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo", debe: 500 }),
    row({ idCuenta: "6101-0090-0000-0000", nombreCuenta: "DEPRECIACION AUTOMOVIL", debe: 40 }),
    row({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "Sueldos", debe: 200 }),
    row({ idCuenta: "6201-0035-0000-0000", nombreCuenta: "AMORTIZACION DE RENTA ANUAL", debe: 30 }),
    row({ idCuenta: "6301-0004-0000-0000", nombreCuenta: "Depreciación Mobiliario y Equipo", debe: 70 }),
    // Balance: depreciación acumulada, jamás entra al PyG ni a la D&A
    row({ idCuenta: "1200-0001-0000-0000", nombreCuenta: "DEPRECIACION AUTOMÓVIL", debe: 999 }),
    row({ idCuenta: "1202-0001-0000-0000", nombreCuenta: "DEPRECIACIÓN SILLAS EJECUTIVAS", haber: 888 }),
  ];
  const estado = buildEstadoOperativo({ acumulado: actual, mesActual: actual, mesAnterior: [] });
  const rows = byKey(estado);
  // D&A dentro de 6101/6201 queda en su subtotal de gasto (no se duplica)
  assert.equal(rows.gastosVenta.mesActual.monto, 240);
  assert.equal(rows.gastosAdmin.mesActual.monto, 30);
  assert.equal(rows.daContable.mesActual.monto, 70);
  assert.equal(rows.totalOpex.mesActual.monto, 340);
  assert.equal(rows.ebit.mesActual.monto, 1160);
  // Reintegro EBITDA: 70 (6301) + 40 (6101-0090) + 30 (6201-0035); 1200/1202 excluidas
  assert.equal(rows.daReintegro.mesActual.monto, 140);
  assert.equal(rows.ebitda.mesActual.monto, 1300);
  assert.equal(rows.ebitda.mesActual.monto, (rows.ebit.mesActual.monto ?? 0) + (rows.daReintegro.mesActual.monto ?? 0));
});

test("RIF neto: productos (haber−debe) − gastos (debe−haber), con signos correctos", () => {
  const actual = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 1000 }),
    row({ idCuenta: "7102-0001-0000-0000", nombreCuenta: "Utilidad cambiaria", haber: 50 }),
    row({ idCuenta: "7104-0023-0000-0000", nombreCuenta: "Otros productos", haber: 10 }),
    row({ idCuenta: "8101-0001-0000-0000", nombreCuenta: "Pérdida cambiaria", debe: 20 }),
    row({ idCuenta: "8101-0002-0000-0000", nombreCuenta: "INTERESES A CARGO BANCARIOS", debe: 180 }),
    row({ idCuenta: "8101-0010-0000-0000", nombreCuenta: "Comisiones bancarias", debe: 5 }),
  ];
  const estado = buildEstadoOperativo({ acumulado: actual, mesActual: actual, mesAnterior: [] });
  const rows = byKey(estado);
  assert.equal(rows.productosFinancieros.mesActual.monto, 60);
  assert.equal(rows.gastosFinancieros.mesActual.monto, 205);
  assert.equal(rows.rif.mesActual.monto, -145);
  assert.equal(rows.ebt.mesActual.monto, 855);
});

test("PTU (6405) e ISR (6406) son impuestos, no OpEx; nómina con 'impuesto' sigue en OpEx", () => {
  const actual = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 1000 }),
    row({ idCuenta: "6101-0029-0000-0000", nombreCuenta: "Impuesto Estatal sobre Nóminas", debe: 15 }),
    row({ idCuenta: "6405-0001-0000-0000", nombreCuenta: "Participacion de los Trabajadores en las Utilidades", debe: 80 }),
    row({ idCuenta: "6406-0001-0000-0000", nombreCuenta: "Impuesto Sobre la renta", debe: 240 }),
  ];
  const estado = buildEstadoOperativo({ acumulado: actual, mesActual: actual, mesAnterior: [] });
  const rows = byKey(estado);
  assert.equal(rows.ptu.mesActual.monto, 80);
  assert.equal(rows.isr.mesActual.monto, 240);
  // El impuesto de nómina es operativo: queda en gastos de venta, no en ISR
  assert.equal(rows.gastosVenta.mesActual.monto, 15);
  assert.equal(rows.totalOpex.mesActual.monto, 15);
  assert.equal(rows.ebit.mesActual.monto, 985);
  assert.equal(rows.utilidadNeta.mesActual.monto, 665);
});

test("sin doble deducción: 8101 no está en OpEx y se descuenta una sola vez vía RIF", () => {
  const base = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 1000 }),
    row({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "Sueldos", debe: 100 }),
  ];
  const conFinancieros = [
    ...base,
    row({ idCuenta: "8101-0002-0000-0000", nombreCuenta: "INTERESES A CARGO BANCARIOS", debe: 120 }),
  ];
  const sinFin = byKey(buildEstadoOperativo({ acumulado: base, mesActual: base, mesAnterior: [] }));
  const conFin = byKey(buildEstadoOperativo({ acumulado: conFinancieros, mesActual: conFinancieros, mesAnterior: [] }));
  // EBIT y OPEX no cambian por gastos financieros
  assert.equal(conFin.totalOpex.mesActual.monto, sinFin.totalOpex.mesActual.monto);
  assert.equal(conFin.ebit.mesActual.monto, sinFin.ebit.mesActual.monto);
  // y se descuentan exactamente una vez: neta = ebit + rif = 900 − 120
  assert.equal(conFin.rif.mesActual.monto, -120);
  assert.equal(conFin.utilidadNeta.mesActual.monto, 780);
});

test("división por cero: ventas = 0 → % null en todas las líneas", () => {
  const actual = [row({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo", debe: 80 })];
  const estado = buildEstadoOperativo({ acumulado: actual, mesActual: actual, mesAnterior: actual });
  const rows = byKey(estado);
  assert.equal(rows.ventas.mesActual.monto, 0);
  assert.equal(rows.ventas.mesActual.pct, null);
  assert.equal(rows.costo.mesActual.pct, null);
  assert.equal(rows.utilidadNeta.mesActual.pct, null);
  assert.equal(rows.costo.variacionPp, null);
});

test("cuadre: Utilidad Neta = Ventas − Costo − OPEX + RIF − Impuestos (acumulado y mes)", () => {
  const enero = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 1000 }),
    row({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo", debe: 300 }),
    row({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "Sueldos", debe: 100 }),
    row({ idCuenta: "6201-0055-0000-0000", nombreCuenta: "Papelería", debe: 20 }),
    row({ idCuenta: "6301-0004-0000-0000", nombreCuenta: "Depreciación Mobiliario", debe: 30 }),
    row({ idCuenta: "7102-0001-0000-0000", nombreCuenta: "Utilidad cambiaria", haber: 25 }),
    row({ idCuenta: "8101-0002-0000-0000", nombreCuenta: "Intereses a cargo", debe: 90 }),
    row({ idCuenta: "6405-0001-0000-0000", nombreCuenta: "PTU", debe: 40 }),
    row({ idCuenta: "6406-0001-0000-0000", nombreCuenta: "ISR", debe: 110 }),
  ];
  const febrero = [
    row({ idCuenta: "4101-0001-0001-0000", nombreCuenta: "Ventas", haber: 2000 }),
    row({ idCuenta: "5101-0001-0000-0000", nombreCuenta: "Costo", debe: 500 }),
    row({ idCuenta: "6101-0001-0000-0000", nombreCuenta: "Sueldos", debe: 110 }),
    row({ idCuenta: "6201-0055-0000-0000", nombreCuenta: "Papelería", debe: 10 }),
    row({ idCuenta: "6301-0004-0000-0000", nombreCuenta: "Depreciación Mobiliario", debe: 30 }),
    row({ idCuenta: "7102-0001-0000-0000", nombreCuenta: "Utilidad cambiaria", haber: 5 }),
    row({ idCuenta: "8101-0002-0000-0000", nombreCuenta: "Intereses a cargo", debe: 95 }),
    row({ idCuenta: "6405-0001-0000-0000", nombreCuenta: "PTU", debe: 50 }),
    row({ idCuenta: "6406-0001-0000-0000", nombreCuenta: "ISR", debe: 130 }),
  ];
  const estado = buildEstadoOperativo({
    acumulado: [...enero, ...febrero],
    mesActual: febrero,
    mesAnterior: enero,
  });
  const rows = byKey(estado);
  for (const col of ["acumulado", "mesActual", "mesAnterior"] as const) {
    const ventas = rows.ventas[col].monto ?? 0;
    const costo = rows.costo[col].monto ?? 0;
    const opex = rows.totalOpex[col].monto ?? 0;
    const rif = rows.rif[col].monto ?? 0;
    const impuestos = (rows.ptu[col].monto ?? 0) + (rows.isr[col].monto ?? 0);
    const neta = rows.utilidadNeta[col].monto ?? 0;
    assert.ok(
      Math.abs(neta - (ventas - costo - opex + rif - impuestos)) < 0.01,
      `cuadre roto en ${col}`,
    );
    // EBITDA = EBIT + D&A en cada columna
    const ebit = rows.ebit[col].monto ?? 0;
    const da = rows.daReintegro[col].monto ?? 0;
    const ebitda = rows.ebitda[col].monto ?? 0;
    assert.ok(Math.abs(ebitda - (ebit + da)) < 0.01, `EBITDA roto en ${col}`);
  }
  // valores puntuales del mes actual (febrero)
  assert.equal(rows.ventas.mesActual.monto, 2000);
  assert.equal(rows.totalOpex.mesActual.monto, 150);
  assert.equal(rows.ebit.mesActual.monto, 1350);
  assert.equal(rows.ebitda.mesActual.monto, 1380);
  assert.equal(rows.rif.mesActual.monto, -90);
  assert.equal(rows.ebt.mesActual.monto, 1260);
  assert.equal(rows.utilidadNeta.mesActual.monto, 1080);
  // acumulado = enero (neta 335) + febrero (neta 1080)
  assert.equal(rows.ventas.acumulado.monto, 3000);
  assert.equal(rows.utilidadNeta.mesAnterior.monto, 335);
  assert.equal(rows.utilidadNeta.acumulado.monto, 1415);
  // variación mes actual vs anterior
  assert.equal(rows.ventas.variacionMonto, 1000);
  assert.equal(rows.utilidadNeta.variacionMonto, 745);
});

test("hasPnl refleja si el mes actual tiene filas de balanza", () => {
  const estado = buildEstadoOperativo({ acumulado: [], mesActual: [], mesAnterior: [] });
  assert.equal(estado.hasPnl, false);
  const conDatos = buildEstadoOperativo({
    acumulado: [row({ idCuenta: "4101-0001", haber: 10 })],
    mesActual: [row({ idCuenta: "4101-0001", haber: 10 })],
    mesAnterior: [],
  });
  assert.equal(conDatos.hasPnl, true);
});
