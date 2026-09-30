import { round2 } from "@/services/money";

export const ANTIGUEDAD_BUCKET_KEYS = ["corriente", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;

export type AntiguedadBucketKey = (typeof ANTIGUEDAD_BUCKET_KEYS)[number];

export type AntiguedadDocumento = {
  tercero: string;
  fechaVencimiento: string;
  saldo: number;
};

export type AntiguedadBucket = {
  key: AntiguedadBucketKey;
  saldo: number;
  documentos: number;
};

export type AntiguedadTerceroRow = {
  tercero: string;
  saldo: number;
  diasVencidos: number;
  bucket: AntiguedadBucketKey;
};

export type AntiguedadModel = {
  total: number;
  buckets: AntiguedadBucket[];
  terceros: AntiguedadTerceroRow[];
};

function parseIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function daysPastDue(fechaVencimiento: string, asOfIso: string): number {
  return Math.floor((parseIso(asOfIso) - parseIso(fechaVencimiento)) / 86_400_000);
}

export function antiguedadBucketKey(diasVencidos: number): AntiguedadBucketKey {
  if (diasVencidos <= 0) {
    return "corriente";
  }
  if (diasVencidos <= 30) {
    return "d1_30";
  }
  if (diasVencidos <= 60) {
    return "d31_60";
  }
  if (diasVencidos <= 90) {
    return "d61_90";
  }
  return "d90_plus";
}

export function buildAntiguedad(documentos: AntiguedadDocumento[], asOfIso: string): AntiguedadModel {
  const open = documentos
    .map((documento) => ({
      ...documento,
      saldo: round2(documento.saldo),
      diasVencidos: daysPastDue(documento.fechaVencimiento, asOfIso),
    }))
    .filter((documento) => documento.saldo > 0);

  const total = round2(open.reduce((sum, documento) => sum + documento.saldo, 0));

  const bucketSaldo = new Map<AntiguedadBucketKey, { saldo: number; documentos: number }>();
  for (const key of ANTIGUEDAD_BUCKET_KEYS) {
    bucketSaldo.set(key, { saldo: 0, documentos: 0 });
  }
  for (const documento of open) {
    const key = antiguedadBucketKey(documento.diasVencidos);
    const entry = bucketSaldo.get(key);
    if (entry) {
      entry.saldo += documento.saldo;
      entry.documentos += 1;
    }
  }
  const buckets: AntiguedadBucket[] = ANTIGUEDAD_BUCKET_KEYS.map((key) => {
    const entry = bucketSaldo.get(key) ?? { saldo: 0, documentos: 0 };
    return { key, saldo: round2(entry.saldo), documentos: entry.documentos };
  });

  const byTercero = new Map<string, AntiguedadTerceroRow>();
  for (const documento of open) {
    const prev = byTercero.get(documento.tercero);
    if (!prev) {
      byTercero.set(documento.tercero, {
        tercero: documento.tercero,
        saldo: documento.saldo,
        diasVencidos: documento.diasVencidos,
        bucket: antiguedadBucketKey(documento.diasVencidos),
      });
      continue;
    }
    const diasVencidos = Math.max(prev.diasVencidos, documento.diasVencidos);
    byTercero.set(documento.tercero, {
      tercero: prev.tercero,
      saldo: round2(prev.saldo + documento.saldo),
      diasVencidos,
      bucket: antiguedadBucketKey(diasVencidos),
    });
  }

  const terceros = [...byTercero.values()].sort((a, b) => b.saldo - a.saldo);
  return { total, buckets, terceros };
}
