import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlujoOperativoPuntos,
  classifyMovimiento,
  desgloseDia,
  esCuentaEfectivo,
  toDiasCalendario,
  type FlujoOperativoMovimiento,
} from "./flujoOperativo";

describe("classifyMovimiento", () => {
  it("clasifica cobranza, deuda, nómina, impuestos y traspasos por concepto", () => {
    assert.equal(classifyMovimiento("ingreso", "Cobro F-471da135-9fcf CLIENTE X", "P-2867"), "cobranza");
    assert.equal(classifyMovimiento("ingreso", "Deposito Operadora Falcon", ""), "cobranza");
    assert.equal(classifyMovimiento("ingreso", "Disposición préstamo BBVA", ""), "prestamos");
    assert.equal(classifyMovimiento("egreso", "PAGO TDC KONFIO JULIO", ""), "pagoDeuda");
    assert.equal(classifyMovimiento("egreso", "PAGO MENSUALIDAD PRESTAMOS BBVA", ""), "pagoDeuda");
    assert.equal(classifyMovimiento("egreso", "PAGO NOMINA QUINCENA 14", ""), "nomina");
    assert.equal(classifyMovimiento("egreso", "PAGO IVA MENSUAL SAT", ""), "impuestos");
    assert.equal(classifyMovimiento("egreso", "RENTA OFICINAS JULIO", ""), "rentaServicios");
    assert.equal(classifyMovimiento("egreso", "SPEI ENVIADO AZTECA JAZMIN GONZALEZ", ""), "proveedores");
    assert.equal(classifyMovimiento("egreso", "Pago F-41-0473 PROVEEDOR SA", "A-41"), "proveedores");
    assert.equal(
      classifyMovimiento("ingreso", "TRASPASO DE LA CUENTA DE BANORTE MXN", "TRASPASO ENTRE BANCOS"),
      "traspasos",
    );
    assert.equal(classifyMovimiento("ingreso", "Ajuste misterioso", ""), "otrosEntradas");
    assert.equal(classifyMovimiento("egreso", "Cargo misterioso", ""), "otrosSalidas");
  });

  it("no confunde tokens dentro de otras palabras", () => {
    assert.equal(classifyMovimiento("egreso", "Pago satisfactorio de servicios", ""), "otrosSalidas");
  });
});

describe("esCuentaEfectivo", () => {
  it("acepta caja y bancos por primer segmento, sin falsos positivos", () => {
    assert.equal(esCuentaEfectivo("1101-0001-0000-0000"), true);
    assert.equal(esCuentaEfectivo("1102-0018-0000-0000"), true);
    assert.equal(esCuentaEfectivo("102-0001"), true);
    assert.equal(esCuentaEfectivo("1010-0001-0000-0000"), false);
    assert.equal(esCuentaEfectivo("1103-0001-0000-0000"), false);
    assert.equal(esCuentaEfectivo("1105-0001-0012-0000"), false);
  });
});

describe("buildFlujoOperativoPuntos", () => {
  const mov = (partial: Partial<FlujoOperativoMovimiento>): FlujoOperativoMovimiento => ({
    fecha: new Date(Date.UTC(2026, 6, 1)),
    idCuenta: "1102-0001-0001-0000",
    concepto: "",
    referencia: "",
    cargos: 0,
    abonos: 0,
    ...partial,
  });

  it("agrega por día, excluye traspasos de entradas/salidas y acumula el saldo real", () => {
    const { puntos, totales, saldoFinal } = buildFlujoOperativoPuntos(
      [
        mov({ concepto: "Cobro F-1 CLIENTE", cargos: 1000 }),
        mov({ concepto: "PAGO NOMINA", abonos: 400 }),
        mov({ concepto: "TRASPASO ENTRE BANCOS", cargos: 600 }),
        mov({ fecha: new Date(Date.UTC(2026, 6, 2)), concepto: "TRASPASO ENTRE BANCOS", abonos: 600 }),
        mov({ fecha: new Date(Date.UTC(2026, 6, 2)), concepto: "PAGO IVA SAT", abonos: 160 }),
      ],
      5000,
    );

    assert.equal(puntos.length, 2);
    const [dia1, dia2] = puntos;
    assert.equal(dia1!.label, "2026-07-01");
    assert.equal(dia1!.entradas, 1000);
    assert.equal(dia1!.salidas, 400);
    assert.equal(dia1!.neto, 600);
    assert.equal(dia1!.traspasos, 600);
    assert.equal(dia1!.saldoAcumulado, 6200); // 5000 + 1000 - 400 + 600 (traspaso sí mueve el saldo)

    assert.equal(dia2!.entradas, 0);
    assert.equal(dia2!.salidas, 160);
    assert.equal(dia2!.saldoAcumulado, 5440); // 6200 - 600 - 160

    assert.equal(totales.entradas, 1000);
    assert.equal(totales.salidas, 560);
    assert.equal(totales.neto, 440);
    assert.equal(totales.traspasos, 1200);
    assert.equal(saldoFinal, 5440);
  });

  it("sin movimientos devuelve series vacías y conserva el saldo inicial", () => {
    const { puntos, totales, saldoFinal } = buildFlujoOperativoPuntos([], 1234.56);
    assert.deepEqual(puntos, []);
    assert.deepEqual(totales, { entradas: 0, salidas: 0, neto: 0, traspasos: 0 });
    assert.equal(saldoFinal, 1234.56);
  });
});

describe("toDiasCalendario", () => {
  const mov = (partial: Partial<FlujoOperativoMovimiento>): FlujoOperativoMovimiento => ({
    fecha: new Date(Date.UTC(2026, 6, 1)),
    idCuenta: "1102-0001-0001-0000",
    concepto: "",
    referencia: "",
    cargos: 0,
    abonos: 0,
    ...partial,
  });

  it("genera el mes completo: días sin movimiento en cero y saldo plano", () => {
    const { puntos, saldoFinal } = buildFlujoOperativoPuntos(
      [
        mov({ fecha: new Date(Date.UTC(2026, 6, 3)), concepto: "Cobro F-9 CLIENTE", cargos: 1000 }),
        mov({ fecha: new Date(Date.UTC(2026, 6, 15)), concepto: "PAGO NOMINA", abonos: 250 }),
      ],
      500,
    );
    const dias = toDiasCalendario(puntos, 500, 2026, 7);

    assert.equal(dias.length, 31);
    assert.equal(dias[0]!.label, "2026-07-01");
    assert.equal(dias[30]!.label, "2026-07-31");

    // Días previos al primer movimiento: flujo cero, saldo = saldo inicial.
    for (const dia of dias.slice(0, 2)) {
      assert.equal(dia.entradas, 0);
      assert.equal(dia.salidas, 0);
      assert.equal(dia.neto, 0);
      assert.equal(dia.saldoAcumulado, 500);
    }

    // Día con movimiento conserva sus cifras.
    const dia3 = dias[2]!;
    assert.equal(dia3.entradas, 1000);
    assert.equal(dia3.saldoAcumulado, 1500);

    // Hueco 04→14: saldo plano en 1500, flujo cero.
    for (const dia of dias.slice(3, 14)) {
      assert.equal(dia.entradas, 0);
      assert.equal(dia.salidas, 0);
      assert.equal(dia.neto, 0);
      assert.equal(dia.saldoAcumulado, 1500);
    }

    // El saldo acumulado del último día cuadra con el cierre del mes.
    assert.equal(dias[30]!.saldoAcumulado, saldoFinal);
    assert.equal(dias[30]!.saldoAcumulado, 1250);
  });

  it("respeta la longitud del mes (febrero 2026 no bisiesto = 28 días)", () => {
    const dias = toDiasCalendario([], 99, 2026, 2);
    assert.equal(dias.length, 28);
    assert.equal(dias[27]!.label, "2026-02-28");
    assert.equal(dias[27]!.saldoAcumulado, 99);
  });

  it("sin movimientos todo el mes queda plano en el saldo inicial", () => {
    const dias = toDiasCalendario([], 777, 2026, 7);
    assert.equal(dias.length, 31);
    assert.ok(dias.every((dia) => dia.saldoAcumulado === 777));
    assert.ok(dias.every((dia) => dia.entradas === 0 && dia.salidas === 0 && dia.neto === 0));
  });
});

describe("desgloseDia", () => {
  const mov = (partial: Partial<FlujoOperativoMovimiento>): FlujoOperativoMovimiento => ({
    fecha: new Date(Date.UTC(2026, 6, 10)),
    idCuenta: "1102-0001-0001-0000",
    concepto: "",
    referencia: "",
    cargos: 0,
    abonos: 0,
    ...partial,
  });

  it("omite conceptos en $0 y ordena de mayor a menor", () => {
    const { puntos } = buildFlujoOperativoPuntos(
      [
        mov({ concepto: "Cobro F-1 CLIENTE", cargos: 3000 }),
        mov({ concepto: "PAGO NOMINA", abonos: 900 }),
        mov({ concepto: "PAGO IVA SAT", abonos: 1600 }),
      ],
      0,
    );
    const desglose = desgloseDia(puntos[0]!);

    // Solo 3 conceptos con movimiento; las otras 7 categorías en $0 se omiten.
    assert.equal(desglose.length, 3);
    assert.deepEqual(
      desglose.map((item) => item.categoria),
      ["cobranza", "impuestos", "nomina"],
    );
    assert.deepEqual(
      desglose.map((item) => item.direccion),
      ["entrada", "salida", "salida"],
    );
    assert.ok(desglose.every((item) => item.monto > 0));
  });

  it("lista traspasos como partida neutral y días sin movimiento quedan vacíos", () => {
    const { puntos } = buildFlujoOperativoPuntos(
      [mov({ concepto: "TRASPASO ENTRE BANCOS", cargos: 750 })],
      0,
    );
    const desglose = desgloseDia(puntos[0]!);
    assert.equal(desglose.length, 1);
    assert.equal(desglose[0]!.categoria, "traspasos");
    assert.equal(desglose[0]!.direccion, "traspaso");

    const dias = toDiasCalendario(puntos, 0, 2026, 7);
    assert.deepEqual(desgloseDia(dias[0]!), []);
  });
});
