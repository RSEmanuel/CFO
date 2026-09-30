import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConcentracion,
  clasificaHhi,
  clasificaRiesgoCuenta,
  plazoMedioDias,
  type ConcentracionCuentaInput,
} from "./concentracionRiesgo";

const DIAS = 31;

let seq = 0;
function input(montoPeriodo: number, extra?: Partial<ConcentracionCuentaInput>): ConcentracionCuentaInput {
  seq += 1;
  return {
    accountId: extra?.accountId ?? `1105-0001-${String(seq).padStart(4, "0")}`,
    entityName: extra?.entityName ?? `Cuenta ${seq}`,
    montoPeriodo,
    saldoInicial: extra?.saldoInicial ?? 0,
    saldoFinal: extra?.saldoFinal ?? 0,
  };
}

describe("concentracionRiesgo: HHI", () => {
  it("2 actores 50/50 → HHI 5,000", () => {
    const model = buildConcentracion([input(50), input(50)], DIAS);
    assert.equal(model.hhi, 5000);
    assert.equal(model.hhiNivel, "alta");
  });

  it("100 actores de 1% → HHI 100", () => {
    const model = buildConcentracion(
      Array.from({ length: 100 }, () => input(10)),
      DIAS,
    );
    assert.equal(model.hhi, 100);
    assert.equal(model.hhiNivel, "baja");
  });

  it("un solo actor → HHI 10,000 (monopolio)", () => {
    const model = buildConcentracion([input(1000)], DIAS);
    assert.equal(model.hhi, 10000);
    assert.equal(model.hhiNivel, "alta");
  });

  it("clasificaHhi aplica los umbrales 1,500 / 2,500", () => {
    assert.equal(clasificaHhi(0), "baja");
    assert.equal(clasificaHhi(1499.99), "baja");
    assert.equal(clasificaHhi(1500), "moderada");
    assert.equal(clasificaHhi(2500), "moderada");
    assert.equal(clasificaHhi(2500.01), "alta");
  });

  it("el HHI se calcula por moneda por separado: mezclar divisas lo distorsiona", () => {
    // MXN: 2 cuentas 50/50 → 5,000. USD: 1 cuenta → 10,000.
    const mxn = buildConcentracion([input(100), input(100)], DIAS);
    const usd = buildConcentracion([input(40)], DIAS);
    assert.equal(mxn.hhi, 5000);
    assert.equal(usd.hhi, 10000);
    // Si se hubieran mezclado (100, 100, 40): HHI ≈ 5,208 — ni lo uno ni lo otro.
    const mezclado = buildConcentracion([input(100), input(100), input(40)], DIAS);
    assert.notEqual(mezclado.hhi, mxn.hhi);
    assert.notEqual(mezclado.hhi, usd.hhi);
  });
});

describe("concentracionRiesgo: Pareto y Top 3", () => {
  it("Pareto N = cuentas que acumulan el 80% (orden desc)", () => {
    // 40, 30, 20, 10 → acumulado 40, 70, 90 → N = 3
    const model = buildConcentracion([input(40), input(30), input(20), input(10)], DIAS);
    assert.equal(model.paretoN, 3);
    assert.equal(model.cuentas, 4);
  });

  it("Pareto N = 1 cuando la primera cuenta ya supera el 80%", () => {
    const model = buildConcentracion([input(85), input(10), input(5)], DIAS);
    assert.equal(model.paretoN, 1);
  });

  it("Top 3 share suma las 3 participaciones mayores", () => {
    const model = buildConcentracion([input(40), input(30), input(20), input(10)], DIAS);
    assert.equal(model.top3Share, 90);
  });

  it("Top 3 share con menos de 3 cuentas suma lo disponible", () => {
    const model = buildConcentracion([input(60), input(40)], DIAS);
    assert.equal(model.top3Share, 100);
  });

  it("ordena desc por monto y acumula porcentajes", () => {
    const model = buildConcentracion([input(10), input(40), input(50)], DIAS);
    assert.deepEqual(
      model.rows.map((row) => row.monto),
      [50, 40, 10],
    );
    assert.deepEqual(
      model.rows.map((row) => row.pctAcumulado),
      [50, 90, 100],
    );
  });
});

describe("concentracionRiesgo: clasificación de riesgo", () => {
  it("umbrales: >25% vulnerable, 10–25% estratégico, <10% diversificado", () => {
    assert.equal(clasificaRiesgoCuenta(25.01), "vulnerable");
    assert.equal(clasificaRiesgoCuenta(25), "estrategico");
    assert.equal(clasificaRiesgoCuenta(10), "estrategico");
    assert.equal(clasificaRiesgoCuenta(9.99), "diversificado");
  });

  it("asigna la clasificación por fila según su participación", () => {
    const model = buildConcentracion([input(50), input(15), input(35)], DIAS);
    const byMonto = new Map(model.rows.map((row) => [row.monto, row.clasificacion]));
    assert.equal(byMonto.get(50), "vulnerable");
    assert.equal(byMonto.get(35), "vulnerable");
    assert.equal(byMonto.get(15), "estrategico");
  });
});

describe("concentracionRiesgo: plazo medio (DSO/DPO individual)", () => {
  it("plazo = (saldo promedio / actividad) × días del periodo", () => {
    // saldoPromedio = (100 + 300) / 2 = 200; actividad 400; 31 días → 15.5
    assert.equal(plazoMedioDias(100, 300, 400, DIAS), 15.5);
  });

  it("división por cero: actividad 0 → null", () => {
    assert.equal(plazoMedioDias(100, 300, 0, DIAS), null);
  });

  it("saldo promedio <= 0 (saldo acreedor) → null", () => {
    assert.equal(plazoMedioDias(-100, -50, 400, DIAS), null);
    assert.equal(plazoMedioDias(0, 0, 400, DIAS), null);
  });

  it("días del periodo <= 0 → null", () => {
    assert.equal(plazoMedioDias(100, 300, 400, 0), null);
  });
});

describe("concentracionRiesgo: universo y guardas", () => {
  it("sin cuentas o total 0 → modelo vacío con métricas null", () => {
    const vacio = buildConcentracion([], DIAS);
    assert.equal(vacio.hhi, null);
    assert.equal(vacio.paretoN, null);
    assert.equal(vacio.top3Share, null);
    assert.equal(vacio.rows.length, 0);

    const purosCeros = buildConcentracion([input(0), input(0)], DIAS);
    assert.equal(purosCeros.hhi, null);
    assert.equal(purosCeros.cuentas, 0);
  });

  it("fallback: cuenta sin actividad pero con saldo pendiente entra por saldo", () => {
    const model = buildConcentracion(
      [input(100), input(0, { saldoFinal: 60 }), input(0, { saldoFinal: 0 })],
      DIAS,
    );
    assert.equal(model.cuentas, 2);
    const porSaldo = model.rows.find((row) => row.baseMonto === "saldo_pendiente");
    assert.ok(porSaldo);
    assert.equal(porSaldo.monto, 60);
    assert.equal(model.total, 160);
    // Sin actividad del mes no hay plazo medio medible.
    assert.equal(porSaldo.plazoMedioDias, null);
  });

  it("excluye cuentas sin actividad y sin saldo (o con saldo acreedor)", () => {
    const model = buildConcentracion(
      [input(100), input(0, { saldoFinal: -20 }), input(0)],
      DIAS,
    );
    assert.equal(model.cuentas, 1);
    assert.equal(model.hhi, 10000);
  });
});
