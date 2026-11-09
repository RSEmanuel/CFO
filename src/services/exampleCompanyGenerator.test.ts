import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { computeErBuckets } from "@/services/estadoOperativo";
import { generateExampleCompany, examplePeriods, lastClosedPeriod } from "@/services/exampleCompanyGenerator";
import { findCashLeaves } from "@/services/ingest/accountRoles";
import { balanceSignConvention, capitalContableNif, structureFromBalanza } from "@/services/metricsLedger";
import { round2 } from "@/services/money";

const HASTA = { anio: 2026, periodo: 10 };
const company = generateExampleCompany(HASTA);
const key = (anio: number, periodo: number) => `${anio}-${periodo}`;
const rowsOf = (anio: number, periodo: number) =>
  company.balanza.filter((row) => row.anio === anio && row.periodo === periodo);
const asLedger = (rows: ReturnType<typeof rowsOf>) => rows as unknown as BalanzaPnL[];

describe("empresa de ejemplo: periodos", () => {
  it("el mes que acaba de cerrar es el mes anterior al actual", () => {
    assert.deepEqual(lastClosedPeriod(new Date("2026-11-09T12:00:00Z")), HASTA);
    assert.deepEqual(lastClosedPeriod(new Date("2027-01-03T12:00:00Z")), { anio: 2026, periodo: 12 });
  });

  it("son 24 meses seguidos, de noviembre 2024 a octubre 2026", () => {
    const periods = examplePeriods(HASTA);
    assert.equal(periods.length, 24);
    assert.deepEqual(periods[0], { anio: 2024, periodo: 11 });
    assert.deepEqual(periods[23], HASTA);
    assert.equal(new Set(company.balanza.map((row) => key(row.anio, row.periodo))).size, 24);
  });
});

describe("empresa de ejemplo: la balanza cuadra cada mes", () => {
  for (const { anio, periodo } of examplePeriods(HASTA)) {
    it(`${anio}-${periodo}: debe = haber, saldos suman cero y cada saldo final se explica`, () => {
      const rows = rowsOf(anio, periodo);
      const debe = round2(rows.reduce((sum, row) => sum + row.debe, 0));
      const haber = round2(rows.reduce((sum, row) => sum + row.haber, 0));
      assert.equal(debe, haber);
      assert.equal(round2(rows.reduce((sum, row) => sum + row.saldoFinal, 0)), 0);
      for (const row of rows) {
        assert.equal(round2(row.saldoInicial + row.debe - row.haber), row.saldoFinal, row.idCuenta);
      }
      assert.equal(balanceSignConvention(asLedger(rows)), -1);
    });
  }

  it("el saldo final de un mes es el saldo inicial del siguiente (salvo el traspaso de utilidad en enero)", () => {
    const periods = examplePeriods(HASTA);
    for (let i = 1; i < periods.length; i += 1) {
      const previous = rowsOf(periods[i - 1]!.anio, periods[i - 1]!.periodo);
      const current = rowsOf(periods[i]!.anio, periods[i]!.periodo);
      for (const row of current) {
        const before = previous.find((item) => item.idCuenta === row.idCuenta)!;
        const isPnl = ["Ingreso", "COGS", "OpEx"].includes(row.categoriaMaestra);
        if (periods[i]!.periodo === 1 && (isPnl || row.idCuenta === "3105-001-000")) {
          continue;
        }
        assert.equal(row.saldoInicial, before.saldoFinal, `${row.idCuenta} ${periods[i]!.anio}-${periods[i]!.periodo}`);
      }
    }
  });

  it("en enero la utilidad del año anterior pasa a resultados anteriores y las cuentas de resultados vuelven a cero", () => {
    const dic = rowsOf(2025, 12);
    const ene = rowsOf(2026, 1);
    const resultado = round2(dic.filter((r) => ["Ingreso", "COGS", "OpEx"].includes(r.categoriaMaestra)).reduce((s, r) => s + r.saldoFinal, 0));
    assert.ok(resultado < 0, "2025 cierra con utilidad (saldo acreedor)");
    const ant = (rows: typeof dic) => rows.find((r) => r.idCuenta === "3105-001-000")!;
    assert.equal(ant(ene).saldoInicial, round2(ant(dic).saldoFinal + resultado));
    assert.ok(ene.filter((r) => ["Ingreso", "COGS", "OpEx"].includes(r.categoriaMaestra)).every((r) => r.saldoInicial === 0));
  });
});

describe("empresa de ejemplo: lo que las pantallas leen", () => {
  it("el estado de resultados trae ingreso, costo, gasto y utilidad en el último mes", () => {
    const buckets = computeErBuckets(rowsOf(2026, 10));
    assert.ok(buckets.ventas > 0 && buckets.costo > 0 && buckets.totalOpex > 0);
    assert.ok(buckets.utilidadNeta > 0);
    assert.ok(buckets.da > 0 && buckets.gastosFinancieros > 0);
  });

  it("hay un mes flojo y un mes de gasto extra, y el último trimestre es el mejor", () => {
    const monthly = examplePeriods(HASTA).map(({ anio, periodo }) => ({ anio, periodo, ...computeErBuckets(rowsOf(anio, periodo)) }));
    const get = (anio: number, periodo: number) => monthly.find((m) => m.anio === anio && m.periodo === periodo)!;
    assert.ok(get(2025, 3).ventas < get(2025, 2).ventas * 0.8, "marzo 2025 flojo");
    assert.ok(get(2025, 8).totalOpex > get(2025, 7).totalOpex + 80_000, "agosto 2025 con gasto extra");
    assert.ok(get(2025, 11).ventas > get(2025, 6).ventas);
    assert.ok(monthly.every((m) => m.ventas % 1_000 === 0), "montos redondos");
  });

  it("la posición cuadra: activo = pasivo + capital con la utilidad del año", () => {
    for (const { anio, periodo } of examplePeriods(HASTA)) {
      const rows = rowsOf(anio, periodo);
      const sum = (pick: (r: (typeof rows)[number]) => boolean) => round2(rows.filter(pick).reduce((s, r) => s + r.saldoFinal, 0));
      const activo = sum((r) => r.categoriaMaestra === "Activo");
      const pasivo = -sum((r) => r.categoriaMaestra === "Pasivo");
      const capital = -sum((r) => r.categoriaMaestra === "Patrimonio");
      const resultado = -sum((r) => ["Ingreso", "COGS", "OpEx"].includes(r.categoriaMaestra));
      assert.equal(activo, round2(pasivo + capital + resultado), `${anio}-${periodo}`);
      assert.ok(activo > 0 && pasivo > 0 && capital > 0);
      const ledger = asLedger(rows);
      assert.equal(capitalContableNif(ledger), round2(capital + resultado));
      assert.equal(structureFromBalanza(ledger).pasivoTotal, -pasivo);
    }
  });

  it("la caja de la balanza es la caja del flujo, y el flujo tiene saldo inicial y final en cada mes", () => {
    let anterior: number | null = null;
    for (const { anio, periodo } of examplePeriods(HASTA)) {
      const rows = rowsOf(anio, periodo);
      const caja = round2(findCashLeaves(rows).reduce((s, r) => s + r.saldoFinal, 0));
      const flujos = company.flujos.filter((f) => f.anio === anio && f.periodo === periodo);
      assert.equal(flujos.length, 2);
      assert.equal(round2(flujos.reduce((s, f) => s + f.saldoFinalPeriodo, 0)), caja, `${anio}-${periodo}`);
      assert.ok(caja > 0, "nunca se queda sin caja");
      const inicial = round2(flujos.reduce((s, f) => s + f.saldoInicialPeriodo, 0));
      if (anterior !== null) assert.equal(inicial, anterior);
      anterior = caja;

      const detalle = company.flujoDetalle.filter((d) => d.anio === anio && d.periodo === periodo);
      const ingresos = detalle.filter((d) => d.direccion === "ingreso").reduce((s, d) => s + d.monto, 0);
      const egresos = detalle.filter((d) => d.direccion === "egreso").reduce((s, d) => s + d.monto, 0);
      assert.equal(round2(inicial + ingresos - egresos), caja);
      const agg = flujos.reduce((s, f) => s + f.entradasOperativas - f.salidasOperativas - f.salidasCapex - f.servicioDeuda, 0);
      assert.equal(round2(inicial + agg), caja);
    }
    assert.ok(company.flujos.some((f) => f.salidasCapex > 0), "hay un poco de inversión");
    assert.ok(company.flujos.every((f) => f.servicioDeuda > 0 || f.idBancoCaja !== "1101-001-000"), "hay servicio de deuda");
  });

  it("cartera: lo que debe cada cliente en la balanza es lo pendiente en sus facturas, con vencidas a más de 60 días", () => {
    const cierre = "2026-10-31";
    const ultimo = rowsOf(2026, 10);
    const ar = round2(ultimo.filter((r) => r.idCuenta.startsWith("1105")).reduce((s, r) => s + r.saldoFinal, 0));
    const pendientes = company.ventas.map((v) => ({ ...v, saldo: round2(v.montoSubtotal + v.iva - v.montoCobrado) }));
    assert.equal(round2(pendientes.reduce((s, v) => s + v.saldo, 0)), ar);
    const dias = (v: { fechaVencimiento: string }) => Math.floor((Date.parse(cierre) - Date.parse(v.fechaVencimiento)) / 86_400_000);
    const abiertas = pendientes.filter((v) => v.saldo > 0);
    assert.ok(abiertas.some((v) => dias(v) > 60), "hay facturas vencidas a más de 60 días");
    assert.ok(abiertas.some((v) => dias(v) <= 0), "hay cartera vigente");
    assert.ok(company.ventas.some((v) => v.estatusPago === "Pagado"));
    assert.ok(company.ventas.every((v) => v.fechaEmision <= cierre));
  });

  it("proveedores: la balanza, el resumen del auxiliar y las facturas pendientes coinciden", () => {
    const ultimo = rowsOf(2026, 10);
    const ap = round2(-ultimo.filter((r) => r.idCuenta.startsWith("2101")).reduce((s, r) => s + r.saldoFinal, 0));
    const resumen = company.auxResumen.filter((r) => r.anio === 2026 && r.periodo === 10 && r.idCuenta.startsWith("2101"));
    assert.equal(round2(resumen.reduce((s, r) => s + r.saldoFinal, 0)), ap);
    assert.equal(round2(company.egresos.filter((e) => e.estatusPago === "Pendiente").reduce((s, e) => s + e.montoSubtotal, 0)), ap);
  });

  it("el auxiliar por cuenta: el resumen de cada mes cierra con sus movimientos y con la balanza", () => {
    for (const r of company.auxResumen) {
      assert.equal(round2(r.saldoInicial + (r.idCuenta.startsWith("1105") ? r.cargos - r.abonos : r.abonos - r.cargos)), r.saldoFinal);
      const bal = rowsOf(r.anio, r.periodo).find((row) => row.idCuenta === r.idCuenta)!;
      assert.equal(Math.abs(bal.saldoFinal), r.saldoFinal);
      assert.equal(bal.debe, r.cargos);
      assert.equal(bal.haber, r.abonos);
    }
    assert.ok(company.auxMovimientos.length > 200);
  });

  it("las pólizas cuadran y reproducen los movimientos de la balanza", () => {
    assert.ok(company.polizas.every((p) => p.cuadrada && p.totalCargos === p.totalAbonos));
    const porMes = new Map<string, number>();
    for (const p of company.polizas) porMes.set(key(p.anio, p.periodo), (porMes.get(key(p.anio, p.periodo)) ?? 0) + 1);
    assert.ok([...porMes.values()].every((n) => n >= 5 && n <= 9), "unas pocas pólizas por mes");
    for (const { anio, periodo } of examplePeriods(HASTA)) {
      const movs = company.polizaMovimientos.filter((m) => m.anio === anio && m.periodo === periodo);
      for (const row of rowsOf(anio, periodo)) {
        const cargo = round2(movs.filter((m) => m.codigoCuenta === row.idCuenta).reduce((s, m) => s + m.cargo, 0));
        const abono = round2(movs.filter((m) => m.codigoCuenta === row.idCuenta).reduce((s, m) => s + m.abono, 0));
        assert.equal(cargo, row.debe, `${row.idCuenta} ${anio}-${periodo}`);
        assert.equal(abono, row.haber, `${row.idCuenta} ${anio}-${periodo}`);
      }
    }
  });

  it("el presupuesto mensual existe para ingresos, costo y gasto", () => {
    for (const { anio, periodo } of examplePeriods(HASTA)) {
      const rows = rowsOf(anio, periodo);
      const sum = (cat: string) => rows.filter((r) => r.categoriaMaestra === cat).reduce((s, r) => s + r.montoPresupuestado, 0);
      assert.ok(sum("Ingreso") > 0 && sum("COGS") > 0 && sum("OpEx") > 0, `${anio}-${periodo}`);
    }
    assert.equal(company.budgetAssumptions.length, 1);
    assert.equal(company.budgetAssumptions[0]!.anio, 2026);
  });

  it("todo está marcado como ejemplo: nombres, folios y sin datos de ningún cliente", () => {
    assert.ok(company.ventas.every((v) => v.nombreCliente.startsWith("Cliente Ejemplo") && v.folioFactura.startsWith("EJ-")));
    assert.ok(company.egresos.every((e) => e.nombreProveedor.startsWith("Proveedor Ejemplo") && e.folioDocumento.startsWith("EJ-")));
    assert.equal(new Set(company.ventas.map((v) => v.folioFactura)).size, company.ventas.length);
    assert.equal(new Set(company.egresos.map((e) => e.folioDocumento)).size, company.egresos.length);
  });
});
