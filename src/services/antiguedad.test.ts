import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANTIGUEDAD_BUCKET_KEYS,
  antiguedadBucketKey,
  buildAntiguedad,
  daysPastDue,
  type AntiguedadDocumento,
} from "./antiguedad";

const AS_OF = "2026-06-30";

describe("antiguedad de saldos", () => {
  it("asigna buckets por días vencidos desde la fecha de vencimiento", () => {
    assert.equal(antiguedadBucketKey(-10), "corriente");
    assert.equal(antiguedadBucketKey(0), "corriente");
    assert.equal(antiguedadBucketKey(1), "d1_30");
    assert.equal(antiguedadBucketKey(30), "d1_30");
    assert.equal(antiguedadBucketKey(31), "d31_60");
    assert.equal(antiguedadBucketKey(60), "d31_60");
    assert.equal(antiguedadBucketKey(61), "d61_90");
    assert.equal(antiguedadBucketKey(90), "d61_90");
    assert.equal(antiguedadBucketKey(91), "d90_plus");
  });

  it("daysPastDue es negativo cuando aún no vence", () => {
    assert.ok(daysPastDue("2026-07-15", AS_OF) < 0);
    assert.equal(daysPastDue("2026-06-30", AS_OF), 0);
    assert.equal(daysPastDue("2026-05-31", AS_OF), 30);
  });

  it("suma buckets y conserva el orden corriente → 90+", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "Cliente A", fechaVencimiento: "2026-07-15", saldo: 100 },
      { tercero: "Cliente B", fechaVencimiento: "2026-06-15", saldo: 200 },
      { tercero: "Cliente C", fechaVencimiento: "2026-04-15", saldo: 400 },
      { tercero: "Cliente D", fechaVencimiento: "2025-12-01", saldo: 800 },
    ];
    const model = buildAntiguedad(documentos, AS_OF);
    assert.deepEqual(
      model.buckets.map((bucket) => bucket.key),
      [...ANTIGUEDAD_BUCKET_KEYS],
    );
    const saldoOf = (key: string) => model.buckets.find((bucket) => bucket.key === key)?.saldo;
    assert.equal(saldoOf("corriente"), 100);
    assert.equal(saldoOf("d1_30"), 200);
    assert.equal(saldoOf("d31_60"), 0);
    assert.equal(saldoOf("d61_90"), 400);
    assert.equal(saldoOf("d90_plus"), 800);
    assert.equal(model.total, 1500);
  });

  it("ignora documentos sin saldo y agrega por tercero con el peor bucket", () => {
    const documentos: AntiguedadDocumento[] = [
      { tercero: "Proveedor X", fechaVencimiento: "2026-07-15", saldo: 0 },
      { tercero: "Proveedor X", fechaVencimiento: "2026-07-01", saldo: 50 },
      { tercero: "Proveedor X", fechaVencimiento: "2026-03-01", saldo: 70 },
    ];
    const model = buildAntiguedad(documentos, AS_OF);
    assert.equal(model.terceros.length, 1);
    const tercero = model.terceros[0];
    assert.equal(tercero.saldo, 120);
    assert.equal(tercero.bucket, "d90_plus");
    assert.equal(model.total, 120);
  });

  it("devuelve ceros cuando no hay documentos abiertos", () => {
    const model = buildAntiguedad([], AS_OF);
    assert.equal(model.total, 0);
    assert.equal(model.terceros.length, 0);
    assert.ok(model.buckets.every((bucket) => bucket.saldo === 0 && bucket.documentos === 0));
  });
});
