import { antiguedadBucketKey, daysPastDue, type AntiguedadBucketKey } from "@/services/antiguedad";
import { round2 } from "@/services/money";

export type CobranzaFactura = {
  cliente: string;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: number;
  cobrado: number;
};

export type CobranzaClienteRow = {
  cliente: string;
  saldo: number;
  /** Días vencidos de su factura más antigua (0 si nada ha vencido). */
  dias: number;
  bucket: AntiguedadBucketKey;
};

export type CobranzaModel = {
  cxcAbierta: number;
  /** null sin ventas de los últimos 12 meses: no hay con qué medir el plazo (no es 0 días). */
  dso: number | null;
  /** % del saldo abierto con más de 60 días de vencido. */
  pctMayor60: number;
  topCliente: { nombre: string; pct: number };
  clientes: CobranzaClienteRow[];
};

export function saldoDe(factura: CobranzaFactura): number {
  return Math.max(0, round2(factura.monto - factura.cobrado));
}

/**
 * `dso` llega ya calculado con la definición única (cccFromBalanza sobre la
 * balanza del mes, igual que el catálogo #31 y la pestaña Cartera).
 */
export function buildCobranza(
  facturas: CobranzaFactura[],
  asOfIso: string,
  dso: number | null = null,
): CobranzaModel {
  const open = facturas
    .map((factura) => ({
      factura,
      saldo: saldoDe(factura),
      // Un solo criterio en Cobranza: días desde el vencimiento, no desde la emisión.
      dias: Math.max(0, daysPastDue(factura.fechaVencimiento, asOfIso)),
    }))
    .filter((item) => item.saldo > 0);

  const cxcAbierta = round2(open.reduce((sum, item) => sum + item.saldo, 0));

  const mayor60 = open.filter((item) => item.dias > 60).reduce((sum, item) => sum + item.saldo, 0);
  const pctMayor60 = cxcAbierta > 0.01 ? round2((mayor60 / cxcAbierta) * 100) : 0;

  const byCliente = new Map<string, CobranzaClienteRow>();
  for (const item of open) {
    const prev = byCliente.get(item.factura.cliente);
    const dias = Math.max(prev?.dias ?? 0, item.dias);
    byCliente.set(item.factura.cliente, {
      cliente: item.factura.cliente,
      saldo: round2((prev?.saldo ?? 0) + item.saldo),
      dias,
      bucket: antiguedadBucketKey(dias),
    });
  }

  const clientes = [...byCliente.values()].sort((a, b) => b.saldo - a.saldo);
  const top = clientes[0];
  const topCliente = {
    nombre: top?.cliente ?? "—",
    pct: top && cxcAbierta > 0.01 ? round2((top.saldo / cxcAbierta) * 100) : 0,
  };

  return { cxcAbierta, dso, pctMayor60, topCliente, clientes };
}
