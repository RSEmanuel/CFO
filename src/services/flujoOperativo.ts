import { normalizeToken } from "@/services/ingest/cells";
import { round2 } from "@/services/money";

export const FLUJO_OPERATIVO_CATEGORIAS = [
  "cobranza",
  "prestamos",
  "traspasos",
  "otrosEntradas",
  "nomina",
  "proveedores",
  "rentaServicios",
  "impuestos",
  "pagoDeuda",
  "otrosSalidas",
] as const;

export type FlujoOperativoCategoria = (typeof FLUJO_OPERATIVO_CATEGORIAS)[number];

export const CATEGORIAS_ENTRADA: readonly FlujoOperativoCategoria[] = [
  "cobranza",
  "prestamos",
  "otrosEntradas",
];

export const CATEGORIAS_SALIDA: readonly FlujoOperativoCategoria[] = [
  "nomina",
  "proveedores",
  "rentaServicios",
  "impuestos",
  "pagoDeuda",
  "otrosSalidas",
];

/** Cuentas de efectivo operativo: caja y bancos (convención CONTPAQi y plantilla). */
export const EFECTIVO_PREFIXES = ["1101", "1102", "101", "102"];

export type FlujoOperativoPunto = {
  label: string;
  entradas: number;
  salidas: number;
  neto: number;
  saldoAcumulado: number;
} & Record<FlujoOperativoCategoria, number>;

export type FlujoOperativoMovimiento = {
  fecha: Date;
  idCuenta: string;
  concepto: string;
  referencia: string;
  cargos: number;
  abonos: number;
};

export type FlujoOperativoPayload = {
  tenantId: string;
  periodo: string;
  moneda: string;
  hasData: boolean;
  cuentas: string[];
  saldoInicial: number;
  saldoFinal: number;
  totales: { entradas: number; salidas: number; neto: number; traspasos: number };
  puntos: FlujoOperativoPunto[];
  availablePeriods: string[];
};

export function esCuentaEfectivo(idCuenta: string): boolean {
  const firstSegment = idCuenta.split("-")[0] ?? idCuenta;
  return EFECTIVO_PREFIXES.includes(firstSegment);
}

function hasAnyToken(normalized: string, tokens: string[]): boolean {
  const words = new Set(normalized.split("_"));
  return tokens.some((token) => {
    const needle = normalizeToken(token);
    if (needle.includes("_")) {
      return normalized.includes(needle);
    }
    // Plurales españoles: prestamo→prestamos, comision→comisiones.
    return words.has(needle) || words.has(`${needle}s`) || words.has(`${needle}es`);
  });
}

/**
 * Clasifica un movimiento bancario por su concepto/referencia. El orden importa:
 * traspasos primero (se excluyen de entradas/salidas operativas) y deuda antes
 * que proveedores ("PAGO TDC...", "PAGO MENSUALIDAD PRESTAMOS...").
 */
export function classifyMovimiento(
  direccion: "ingreso" | "egreso",
  concepto: string,
  referencia: string,
): FlujoOperativoCategoria {
  const text = normalizeToken(`${concepto} ${referencia}`);
  if (hasAnyToken(text, ["traspaso", "transferencia entre", "entre bancos", "entre cuentas"])) {
    return "traspasos";
  }
  if (direccion === "ingreso") {
    if (hasAnyToken(text, ["prestamo", "disposicion", "credito", "financiamiento"])) {
      return "prestamos";
    }
    if (hasAnyToken(text, ["cobro", "cobranza", "deposito", "recuperacion", "anticipo de cliente"])) {
      return "cobranza";
    }
    return "otrosEntradas";
  }
  if (hasAnyToken(text, ["tdc", "konfio", "prestamo", "amortizacion", "comision", "interes"])) {
    return "pagoDeuda";
  }
  if (hasAnyToken(text, ["nomina", "sueldo", "salario", "aguinaldo", "ptu", "asimilados"])) {
    return "nomina";
  }
  if (hasAnyToken(text, ["sat", "iva", "isr", "impuesto", "imss", "infonavit", "declaracion", "pago provisional", "retencion"])) {
    return "impuestos";
  }
  if (hasAnyToken(text, ["renta", "arrendamiento"])) {
    return "rentaServicios";
  }
  if (hasAnyToken(text, ["spei", "proveedor", "compra", "pago f", "pago factura"])) {
    return "proveedores";
  }
  return "otrosSalidas";
}

function emptyPunto(label: string): FlujoOperativoPunto {
  return {
    label,
    entradas: 0,
    salidas: 0,
    neto: 0,
    saldoAcumulado: 0,
    cobranza: 0,
    prestamos: 0,
    traspasos: 0,
    otrosEntradas: 0,
    nomina: 0,
    proveedores: 0,
    rentaServicios: 0,
    impuestos: 0,
    pagoDeuda: 0,
    otrosSalidas: 0,
  };
}

function dayKey(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export type FlujoOperativoDesglose = {
  categoria: FlujoOperativoCategoria;
  /** Monto absoluto del día (siempre positivo; la dirección va en `direccion`). */
  monto: number;
  direccion: "entrada" | "salida" | "traspaso";
};

/**
 * Desglose del tooltip diario: SOLO conceptos con movimiento ese día (sin $0),
 * ordenados de mayor a menor. Los traspasos se listan como partida neutral
 * porque explican movimientos del saldo que no pasan por entradas/salidas.
 */
export function desgloseDia(punto: FlujoOperativoPunto): FlujoOperativoDesglose[] {
  const items: FlujoOperativoDesglose[] = [];
  for (const categoria of CATEGORIAS_ENTRADA) {
    const monto = punto[categoria];
    if (monto > 0.005) {
      items.push({ categoria, monto, direccion: "entrada" });
    }
  }
  for (const categoria of CATEGORIAS_SALIDA) {
    const monto = punto[categoria];
    if (monto > 0.005) {
      items.push({ categoria, monto, direccion: "salida" });
    }
  }
  if (punto.traspasos > 0.005) {
    items.push({ categoria: "traspasos", monto: punto.traspasos, direccion: "traspaso" });
  }
  return items.sort((a, b) => b.monto - a.monto);
}

/**
 * Serie continua día 1 → último día del mes. Los días sin movimiento quedan en
 * cero y arrastran el saldo del día anterior (línea plana); los anteriores al
 * primer movimiento arrastran el saldo inicial del mes. El último día conserva
 * el saldo de cierre, que cuadra con el saldo final del auxiliar de bancos.
 */
export function toDiasCalendario(
  puntos: FlujoOperativoPunto[],
  saldoInicial: number,
  anio: number,
  mes: number,
): FlujoOperativoPunto[] {
  const byDay = new Map(puntos.map((punto) => [punto.label, punto]));
  const daysInMonth = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dias: FlujoOperativoPunto[] = [];
  let running = saldoInicial;
  for (let dia = 1; dia <= daysInMonth; dia += 1) {
    const label = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const existente = byDay.get(label);
    if (existente) {
      running = existente.saldoAcumulado;
      dias.push(existente);
    } else {
      dias.push({ ...emptyPunto(label), saldoAcumulado: running });
    }
  }
  return dias;
}

/**
 * Agrega movimientos diarios de cuentas de efectivo. entradas/salidas excluyen
 * traspasos (movimientos entre cuentas propias); saldoAcumulado incluye TODOS
 * los movimientos para reflejar la evolución real del efectivo.
 */
export function buildFlujoOperativoPuntos(
  movimientos: FlujoOperativoMovimiento[],
  saldoInicial: number,
): { puntos: FlujoOperativoPunto[]; totales: FlujoOperativoPayload["totales"]; saldoFinal: number } {
  const byDay = new Map<string, FlujoOperativoPunto>();
  let running = saldoInicial;
  const totales = { entradas: 0, salidas: 0, neto: 0, traspasos: 0 };

  const sorted = [...movimientos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  for (const mov of sorted) {
    const key = dayKey(mov.fecha);
    const punto = byDay.get(key) ?? emptyPunto(key);
    if (!byDay.has(key)) {
      // El saldo acumulado arrastra el cierre del día anterior.
      punto.saldoAcumulado = running;
      byDay.set(key, punto);
    }
    let netoDia = 0;
    if (mov.cargos > 0) {
      const categoria = classifyMovimiento("ingreso", mov.concepto, mov.referencia);
      punto[categoria] = round2(punto[categoria] + mov.cargos);
      netoDia += mov.cargos;
      if (categoria === "traspasos") {
        totales.traspasos = round2(totales.traspasos + mov.cargos);
      } else {
        punto.entradas = round2(punto.entradas + mov.cargos);
      }
    }
    if (mov.abonos > 0) {
      const categoria = classifyMovimiento("egreso", mov.concepto, mov.referencia);
      punto[categoria] = round2(punto[categoria] + mov.abonos);
      netoDia -= mov.abonos;
      if (categoria === "traspasos") {
        totales.traspasos = round2(totales.traspasos + mov.abonos);
      } else {
        punto.salidas = round2(punto.salidas + mov.abonos);
      }
    }
    running = round2(running + netoDia);
    punto.saldoAcumulado = running;
  }

  const puntos = [...byDay.values()];
  for (const punto of puntos) {
    punto.neto = round2(punto.entradas - punto.salidas);
  }
  totales.entradas = round2(puntos.reduce((sum, punto) => sum + punto.entradas, 0));
  totales.salidas = round2(puntos.reduce((sum, punto) => sum + punto.salidas, 0));
  totales.neto = round2(totales.entradas - totales.salidas);
  return { puntos, totales, saldoFinal: running };
}
