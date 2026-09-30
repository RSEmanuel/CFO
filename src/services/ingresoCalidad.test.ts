import assert from "node:assert/strict";
import test from "node:test";
import { computeErBuckets } from "@/services/estadoOperativo";
import {
  INGRESO_TABLA_MIN_MXN,
  buildCalidadFacturacion,
  buildIngresoMonitor,
  buildPacing,
  buildTablaComercial,
} from "@/services/ingresoCalidad";

function row(
  idCuenta: string,
  nombreCuenta: string,
  debe: number,
  haber = 0,
): { idCuenta: string; nombreCuenta: string; debe: number; haber: number } {
  return { idCuenta, nombreCuenta, debe, haber };
}

test("calidad: brutas = Σ haber 4xxx, deducciones = Σ debe 4xxx, netas = brutas − deducciones", () => {
  const actual = [
    row("4101-0001-0001-0000", "Vtas y/o serv. grav. tasa gral", 0, 4_193_494.13),
    row("4201-0001-0000-0000", "Dev sobre Vts tasa gral", 50_000),
    // Cargo directo sobre 4101 (patrón real 2024-11/2026-01/2026-02):
    row("4101-0002-0001-0000", "VTAS. Y/O SERV. GRAV T.CERO", 10_000, 100_000),
  ];
  const calidad = buildCalidadFacturacion(actual);
  assert.equal(calidad.ventasBrutas, 4_293_494.13);
  assert.equal(calidad.deducciones, 60_000);
  assert.equal(calidad.ventasNetas, 4_233_494.13);
  // Cuadra con el bucket canónico de ventas (haber − debe).
  assert.equal(calidad.ventasNetas, computeErBuckets(actual).ventas);
  assert.equal(calidad.tasaErosionPct, 1.4);
  assert.equal(calidad.badge, "verde");
});

test("calidad: cuentas financieras 7xx nunca entran a ventas operativas", () => {
  const actual = [
    row("4101-0001-0001-0000", "Ventas", 0, 1_000_000),
    row("7102-0001-0000-0000", "Utilidad cambiaria", 0, 33_141.84),
    row("7104-0023-0000-0000", "Otros productos", 0, 1.02),
  ];
  const calidad = buildCalidadFacturacion(actual);
  assert.equal(calidad.ventasBrutas, 1_000_000);
  assert.equal(calidad.ventasNetas, 1_000_000);
});

test("calidad: badge ámbar cuando la erosión supera el umbral; sin brutas → null", () => {
  const alta = buildCalidadFacturacion([
    row("4101-0001-0000-0000", "Ventas", 0, 1_000_000),
    row("4201-0001-0000-0000", "Devoluciones", 40_000),
  ]);
  assert.equal(alta.tasaErosionPct, 4);
  assert.equal(alta.badge, "ambar");

  const sinVentas = buildCalidadFacturacion([row("4201-0001-0000-0000", "Devoluciones", 5_000)]);
  assert.equal(sinVentas.ventasBrutas, 0);
  assert.equal(sinVentas.tasaErosionPct, null);
  assert.equal(sinVentas.badge, null);
});

test("pacing: periodo cerrado → avance 100% y cierre estimado = cierre real", () => {
  // jul-2026 con "hoy" en sep-2026: mes cerrado.
  const pacing = buildPacing(4_193_494.13, {
    anio: 2026,
    mes: 7,
    hoy: new Date(Date.UTC(2026, 8, 18)),
    presupuesto: null,
  });
  assert.equal(pacing.diasTotales, 31);
  assert.equal(pacing.diasTranscurridos, 31);
  assert.equal(pacing.avancePct, 100);
  assert.equal(pacing.esCierre, true);
  assert.equal(pacing.promedioDiario, Math.round((4_193_494.13 / 31) * 100) / 100);
  assert.equal(pacing.cierreEstimado, 4_193_494.13);
  assert.equal(pacing.presupuesto, null);
  assert.equal(pacing.varPresupuestoPct, null);
  assert.equal(pacing.varPresupuestoMxn, null);
});

test("pacing: mes en curso proyecta con días transcurridos; variación vs presupuesto", () => {
  // "hoy" = 16-jul-2026 → 16 de 31 días.
  const pacing = buildPacing(2_000_000, {
    anio: 2026,
    mes: 7,
    hoy: new Date(Date.UTC(2026, 6, 16)),
    presupuesto: 4_000_000,
  });
  assert.equal(pacing.diasTranscurridos, 16);
  assert.equal(pacing.diasTotales, 31);
  assert.equal(pacing.esCierre, false);
  assert.equal(pacing.promedioDiario, 125_000);
  assert.equal(pacing.cierreEstimado, 3_875_000);
  assert.equal(pacing.presupuesto, 4_000_000);
  assert.equal(pacing.varPresupuestoMxn, -125_000);
  assert.equal(pacing.varPresupuestoPct, -3.1);
});

test("pacing: presupuesto en 0 se trata como sin presupuesto", () => {
  const pacing = buildPacing(1_000_000, {
    anio: 2026,
    mes: 7,
    hoy: new Date(Date.UTC(2026, 8, 1)),
    presupuesto: 0,
  });
  assert.equal(pacing.presupuesto, null);
  assert.equal(pacing.varPresupuestoPct, null);
});

test("tabla: subcuentas < $10K se pliegan en Otros ingresos menores; $0 se oculta", () => {
  const actual = [
    row("4101-0001-0001-0000", "Vtas tasa gral", 0, 4_000_000),
    row("4101-0002-0001-0000", "Vtas tasa cero", 0, 9_999.99),
    row("4103-0001-0000-0000", "Otros Ingresos", 0, 5_000),
    row("4103-0002-0000-0000", "Ganancia venta activo", 0, 0),
  ];
  const tabla = buildTablaComercial(actual, null, null, 4_014_999.99);
  assert.equal(tabla.length, 2);
  const principal = tabla.find((r) => r.idCuenta === "4101-0001-0001-0000");
  assert.ok(principal);
  assert.equal(principal.monto, 4_000_000);
  assert.equal(principal.pctVentas, 99.6);
  const otros = tabla.find((r) => r.esOtrosMenores);
  assert.ok(otros);
  assert.equal(otros.idCuenta, null);
  assert.equal(otros.monto, 14_999.99);
  // Suma de filas = ventas netas (identidad de materialidad).
  const suma = tabla.reduce((sum, r) => sum + r.monto, 0);
  assert.equal(Math.round(suma * 100) / 100, 4_014_999.99);
});

test("tabla: pliegue neto ~$0 no genera fila; devoluciones grandes salen como fila negativa", () => {
  const actual = [
    row("4101-0001-0001-0000", "Ventas", 0, 1_000_000),
    row("4101-0002-0001-0000", "Chica +", 0, 4_000),
    row("4101-0003-0001-0000", "Chica −", 4_000),
    row("4201-0001-0000-0000", "Dev sobre Vts", 50_000),
  ];
  const tabla = buildTablaComercial(actual, null, null, 950_000);
  assert.equal(tabla.length, 2);
  assert.ok(tabla.every((r) => !r.esOtrosMenores));
  const dev = tabla.find((r) => r.idCuenta === "4201-0001-0000-0000");
  assert.ok(dev);
  assert.equal(dev.monto, -50_000);
  assert.equal(dev.pctVentas, -5.3);
});

test("tabla: MoM y YoY por cuenta; sin comparable → null", () => {
  const actual = [row("4101-0001-0001-0000", "Ventas", 0, 1_100_000)];
  const mesAnterior = [row("4101-0001-0001-0000", "Ventas", 0, 1_000_000)];
  const anoAnterior = [row("4101-0001-0001-0000", "Ventas", 0, 500_000)];
  const tabla = buildTablaComercial(actual, mesAnterior, anoAnterior, 1_100_000);
  const principal = tabla[0];
  assert.equal(principal.momPct, 10);
  assert.equal(principal.yoyPct, 120);

  const sinHistoria = buildTablaComercial(actual, null, null, 1_100_000);
  assert.equal(sinHistoria[0]?.momPct, null);
  assert.equal(sinHistoria[0]?.yoyPct, null);

  // Mes anterior en 0 → no se inventa el signo.
  const conCero = buildTablaComercial(actual, [row("4101-0001-0001-0000", "Ventas", 0, 0)], null, 1_100_000);
  assert.equal(conCero[0]?.momPct, null);
});

test("monitor: integración jul-2026 con valores reales del tenant", () => {
  const actual = [
    row("4101-0001-0001-0000", "Vtas y/o serv. grav. tasa gral", 0, 4_193_494.13),
    row("4101-0002-0001-0000", "VTAS. Y/O SERV. GRAV T.CERO", 0, 0),
    row("4103-0001-0000-0000", "Otros Ingresos", 0, 0),
    row("4103-0002-0000-0000", "Ganancia por venta de activo fijo", 0, 0),
    row("4201-0001-0000-0000", "Dev sobre Vts tasa gral", 0, 0),
    row("7102-0001-0000-0000", "Utilidad cambiaria", 0, 33_141.84),
    row("7102-0002-0000-0000", "Ganancia de fondos de inversió", 0, 17.54),
  ];
  const model = buildIngresoMonitor({
    actual,
    mesAnterior: [row("4101-0001-0001-0000", "Vtas y/o serv. grav. tasa gral", 0, 2_496_006.05)],
    anoAnterior: [row("4101-0001-0001-0000", "Vtas y/o serv. grav. tasa gral", 0, 3_000_000)],
    anio: 2026,
    mes: 7,
    hoy: new Date(Date.UTC(2026, 8, 18)),
    presupuesto: null,
  });
  assert.equal(model.calidad.ventasBrutas, 4_193_494.13);
  assert.equal(model.calidad.deducciones, 0);
  assert.equal(model.calidad.ventasNetas, 4_193_494.13);
  assert.equal(model.calidad.tasaErosionPct, 0);
  assert.equal(model.calidad.badge, "verde");
  assert.equal(model.pacing.esCierre, true);
  assert.equal(model.pacing.cierreEstimado, 4_193_494.13);
  assert.equal(model.pacing.presupuesto, null);
  // Solo una fila material (4101-0001); el resto está en $0 y se oculta.
  assert.equal(model.tabla.length, 1);
  assert.equal(model.tabla[0]?.monto, 4_193_494.13);
  assert.equal(model.tabla[0]?.pctVentas, 100);
  assert.equal(model.tabla[0]?.momPct, 68);
  assert.equal(model.tabla[0]?.yoyPct, 39.8);
});

test("tabla: umbral exacto de materialidad ($10K visible, $9,999.99 plegado)", () => {
  const actual = [
    row("4101-0001-0001-0000", "Grande", 0, 1_000_000),
    row("4101-0002-0001-0000", "Justo", 0, INGRESO_TABLA_MIN_MXN),
    row("4101-0003-0001-0000", "Apenas no", 0, INGRESO_TABLA_MIN_MXN - 0.01),
  ];
  const tabla = buildTablaComercial(actual, null, null, 1_010_000);
  assert.ok(tabla.some((r) => r.idCuenta === "4101-0002-0001-0000"));
  assert.ok(!tabla.some((r) => r.idCuenta === "4101-0003-0001-0000"));
  const otros = tabla.find((r) => r.esOtrosMenores);
  assert.equal(otros?.monto, 9_999.99);
});
