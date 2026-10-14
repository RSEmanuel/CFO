import { round2 } from "@/services/money";

/**
 * "Clientes con facturas sin cobrar" (B07, fuente: movimientos auxiliares de la
 * cuenta de clientes de CONTPAQi). Esa fuente NO trae fecha de vencimiento ni
 * plazo de crédito, y cada empresa fija el suyo; por eso aquí solo se cuentan
 * los días desde la factura, nunca "vencido". Cifra los calcula, no vienen
 * directos de la contabilidad: se muestran como estimados.
 *
 * Método (PEPS): cada cobro (abono) liquida primero la factura más antigua del
 * cliente. Lo que queda abierto conserva la fecha de su cargo. El monto de
 * cada cliente siempre es el saldo final de la contabilidad.
 */

export type MovimientoCartera = {
  /** YYYY-MM-DD */
  fecha: string;
  cargos: number;
  abonos: number;
};

export type CuentaCartera = {
  cliente: string;
  /** YYYY-MM-DD: primer día de los datos cargados de esta cuenta (de ahí "al menos N días"). */
  inicio: string;
  /** Saldo de la cuenta al inicio del primer periodo cargado. */
  saldoInicial: number;
  /** Saldo final del último periodo cargado (verdad contable). */
  saldoFinal: number;
  movimientos: MovimientoCartera[];
};

export type AccionSinCobrar = "seguimiento" | "llamar" | "exigir_fecha" | "revisar_plazo";

export type ClienteSinCobrar = {
  cliente: string;
  saldo: number;
  /** Días desde la factura abierta más antigua. */
  diasSinCobrar: number;
  /** true si esa factura más antigua no está en los movimientos cargados: son "al menos" N días. */
  alMenos: boolean;
  accion: AccionSinCobrar;
};

export type ClientesSinCobrarModel = {
  totalSaldo: number;
  clientes: ClienteSinCobrar[];
  /** Cuántos clientes concentran `topPct` (hasta 3). */
  topCount: number;
  topPct: number;
};

type Capa = { fecha: string; monto: number; alMenos: boolean };

function parseIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function diasDesde(fechaIso: string, corteIso: string): number {
  return Math.max(0, Math.floor((parseIso(corteIso) - parseIso(fechaIso)) / 86_400_000));
}

/** Mismos cortes (30, 60, 90) que el resto de Cobranza. Sin plazo conocido, el último paso pide revisarlo. */
export function accionSinCobrar(dias: number): AccionSinCobrar {
  if (dias <= 30) {
    return "seguimiento";
  }
  if (dias <= 60) {
    return "llamar";
  }
  if (dias <= 90) {
    return "exigir_fecha";
  }
  return "revisar_plazo";
}

/** Facturas (cargos) que siguen abiertas tras aplicar los cobros, la más antigua primero. */
export function capasAbiertas(cuenta: CuentaCartera): Capa[] {
  const capas: Capa[] = [];
  if (cuenta.saldoInicial > 0.01) {
    capas.push({ fecha: cuenta.inicio, monto: cuenta.saldoInicial, alMenos: true });
  }
  const ordenados = [...cuenta.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const movimiento of ordenados) {
    if (movimiento.cargos > 0) {
      capas.push({ fecha: movimiento.fecha, monto: movimiento.cargos, alMenos: false });
    }
    consumir(capas, movimiento.abonos);
  }

  // El saldo final de la contabilidad manda. Si faltan meses entre archivos, la
  // diferencia es deuda más antigua que lo cargado; si sobra, se aplicó a lo más viejo.
  const diferencia = round2(cuenta.saldoFinal - capas.reduce((sum, capa) => sum + capa.monto, 0));
  if (diferencia > 1) {
    capas.unshift({ fecha: cuenta.inicio, monto: diferencia, alMenos: true });
  } else if (diferencia < -1) {
    consumir(capas, -diferencia);
  }
  return capas.filter((capa) => capa.monto > 0.01);
}

function consumir(capas: Capa[], monto: number): void {
  let restante = monto;
  while (restante > 0.005 && capas.length > 0) {
    const primera = capas[0];
    if (!primera) {
      return;
    }
    if (primera.monto > restante + 0.005) {
      primera.monto = round2(primera.monto - restante);
      return;
    }
    restante = round2(restante - primera.monto);
    capas.shift();
  }
}

export function buildClientesSinCobrar(cuentas: CuentaCartera[], corteIso: string): ClientesSinCobrarModel {
  const clientes: ClienteSinCobrar[] = [];
  for (const cuenta of cuentas) {
    // Saldo a favor o saldado: no es un cliente que te deba.
    if (cuenta.saldoFinal <= 1) {
      continue;
    }
    const capas = capasAbiertas(cuenta);
    const masAntigua = capas[0];
    if (!masAntigua) {
      continue;
    }
    const dias = diasDesde(masAntigua.fecha, corteIso);
    clientes.push({
      cliente: cuenta.cliente,
      saldo: round2(cuenta.saldoFinal),
      diasSinCobrar: dias,
      alMenos: masAntigua.alMenos,
      accion: accionSinCobrar(dias),
    });
  }
  clientes.sort((a, b) => b.saldo - a.saldo || b.diasSinCobrar - a.diasSinCobrar);

  const totalSaldo = round2(clientes.reduce((sum, row) => sum + row.saldo, 0));
  const topCount = Math.min(3, clientes.length);
  const topSum = clientes.slice(0, topCount).reduce((sum, row) => sum + row.saldo, 0);
  return {
    totalSaldo,
    clientes,
    topCount,
    topPct: totalSaldo > 0.01 ? round2((topSum / totalSaldo) * 100) : 0,
  };
}

/** El cliente de la alerta: el de mayor monto entre los que pasan de 90 días sin pagar. */
export function clienteParaRevisar(model: ClientesSinCobrarModel): ClienteSinCobrar | null {
  return model.clientes.find((row) => row.accion === "revisar_plazo") ?? null;
}
