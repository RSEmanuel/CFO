import { round2 } from "@/services/money";

export const AGING_BUCKETS = ["0–30", "31–60", "61–90", "90+"] as const;

export type AgingBucketLabel = (typeof AGING_BUCKETS)[number];

export type CobranzaFactura = {
  cliente: string;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: number;
  cobrado: number;
};

export type CobranzaAgingBar = {
  name: AgingBucketLabel;
  saldo: number;
};

export type CobranzaClienteRow = {
  cliente: string;
  saldo: number;
  dias: number;
  bucket: AgingBucketLabel;
};

export type CobranzaModel = {
  cxcAbierta: number;
  dso: number;
  pctMayor60: number;
  topCliente: { nombre: string; pct: number };
  aging: CobranzaAgingBar[];
  clientes: CobranzaClienteRow[];
};

function parseIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1);
}

export function daysBetween(fromIso: string, asOfIso: string): number {
  const diff = parseIso(asOfIso) - parseIso(fromIso);
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function saldoDe(factura: CobranzaFactura): number {
  return Math.max(0, round2(factura.monto - factura.cobrado));
}

export function bucketOf(dias: number): AgingBucketLabel {
  if (dias <= 30) {
    return "0–30";
  }
  if (dias <= 60) {
    return "31–60";
  }
  if (dias <= 90) {
    return "61–90";
  }
  return "90+";
}

export function buildCobranza(
  facturas: CobranzaFactura[],
  asOfIso: string,
  ingresoTtm = 0,
): CobranzaModel {
  const open = facturas
    .map((factura) => ({
      factura,
      saldo: saldoDe(factura),
      dias: daysBetween(factura.fechaEmision, asOfIso),
    }))
    .filter((item) => item.saldo > 0);

  const cxcAbierta = round2(open.reduce((sum, item) => sum + item.saldo, 0));
  const dso = ingresoTtm > 0.01 ? Math.round((cxcAbierta / ingresoTtm) * 365) : 0;

  const agingMap: Record<AgingBucketLabel, number> = {
    "0–30": 0,
    "31–60": 0,
    "61–90": 0,
    "90+": 0,
  };
  for (const item of open) {
    const bucket = bucketOf(item.dias);
    agingMap[bucket] += item.saldo;
  }
  const aging: CobranzaAgingBar[] = AGING_BUCKETS.map((name) => ({ name, saldo: round2(agingMap[name]) }));
  const mayor60 = agingMap["61–90"] + agingMap["90+"];
  const pctMayor60 = cxcAbierta > 0.01 ? round2((mayor60 / cxcAbierta) * 100) : 0;

  const byCliente = new Map<string, CobranzaClienteRow>();
  for (const item of open) {
    const bucket = bucketOf(item.dias);
    const prev = byCliente.get(item.factura.cliente);
    if (!prev) {
      byCliente.set(item.factura.cliente, {
        cliente: item.factura.cliente,
        saldo: item.saldo,
        dias: item.dias,
        bucket,
      });
      continue;
    }
    const dias = Math.max(prev.dias, item.dias);
    byCliente.set(item.factura.cliente, {
      cliente: prev.cliente,
      saldo: round2(prev.saldo + item.saldo),
      dias,
      bucket: bucketOf(dias),
    });
  }

  const clientes = [...byCliente.values()].sort((a, b) => b.saldo - a.saldo);
  const top = clientes[0];
  const topCliente = {
    nombre: top?.cliente ?? "—",
    pct: top && cxcAbierta > 0.01 ? round2((top.saldo / cxcAbierta) * 100) : 0,
  };

  return { cxcAbierta, dso, pctMayor60, topCliente, aging, clientes };
}
