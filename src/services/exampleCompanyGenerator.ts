import { round2 } from "./money";

/**
 * Cifras de EJEMPLO de «Distribuidora Ejemplo (demostración)».
 *
 * Generador puro y determinista: no toca la base, no copia nada de ningún cliente y no usa azar.
 * Toda la contabilidad sale de un solo diario de eventos (facturas, cobros, pagos, nómina…), y de ese
 * diario se derivan la balanza, los auxiliares, el flujo, las pólizas y las facturas. Así todo cuadra
 * entre sí sin parches.
 *
 * Convención de saldos (igual que CONTPAQi): deudor positivo, acreedor negativo. Las cuentas de
 * resultados acumulan en el año (saldo inicial 0 en enero) y la utilidad pasa a 3105 al cambiar de año.
 * Las cuentas de proveedores en el auxiliar (resumen y movimientos) se guardan en magnitud positiva.
 *
 * Simplificación declarada: las compras a proveedores van sin IVA acreditable; solo las ventas llevan IVA.
 */

export type ExampleCategory = "Activo" | "Pasivo" | "Patrimonio" | "Ingreso" | "COGS" | "OpEx";

export type ExampleAccount = {
  idCuenta: string;
  nombreCuenta: string;
  categoria: ExampleCategory;
  da?: boolean;
};

export type ExampleBalanzaRow = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: ExampleCategory;
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  montoPresupuestado: number;
  depreciacionAmortizacion: boolean;
  anio: number;
  periodo: number;
};

export type ExampleVenta = {
  idCliente: string;
  nombreCliente: string;
  folioFactura: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoSubtotal: number;
  iva: number;
  montoCobrado: number;
  estatusPago: "Pagado" | "Pendiente";
  lineaNegocio: string;
};

export type ExampleEgreso = {
  idProveedor: string;
  nombreProveedor: string;
  folioDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoSubtotal: number;
  centroDeCostos: string;
  clasificacionGasto: "Fijo" | "Variable";
  tipoInversion: "OpEx" | "CapEx";
  estatusPago: "Pagado" | "Pendiente";
};

export type ExampleFlujo = {
  anio: number;
  periodo: number;
  idBancoCaja: string;
  saldoInicialPeriodo: number;
  entradasOperativas: number;
  salidasOperativas: number;
  salidasCapex: number;
  servicioDeuda: number;
  saldoFinalPeriodo: number;
};

export type ExampleFlujoDetalle = {
  anio: number;
  periodo: number;
  idBancoCaja: string;
  direccion: "ingreso" | "egreso";
  categoriaKey: string;
  labelOrigen: string;
  monto: number;
  esTraspaso: boolean;
  orden: number;
};

export type ExampleAuxMovimiento = {
  anio: number;
  periodo: number;
  moneda: "MXN";
  idCuenta: string;
  nombreCuenta: string;
  fecha: string;
  tipoPoliza: string;
  numeroPoliza: string;
  concepto: string;
  referencia: string;
  cargos: number;
  abonos: number;
  saldo: number;
};

export type ExampleAuxResumen = {
  anio: number;
  periodo: number;
  moneda: "MXN";
  idCuenta: string;
  nombreCuenta: string;
  saldoInicial: number;
  cargos: number;
  abonos: number;
  saldoFinal: number;
};

export type ExamplePoliza = {
  anio: number;
  periodo: number;
  tipo: string;
  numero: number;
  fecha: string;
  concepto: string;
  totalCargos: number;
  totalAbonos: number;
  cuadrada: boolean;
  movimientosCount: number;
};

export type ExamplePolizaMovimiento = {
  anio: number;
  periodo: number;
  tipoPoliza: string;
  numeroPoliza: number;
  numeroMovimiento: number;
  codigoCuenta: string;
  nombreCuenta: string;
  referencia: string;
  concepto: string;
  cargo: number;
  abono: number;
};

export type ExampleBudgetAssumption = {
  anio: number;
  salesGrowthPct: number;
  inflationPct: number;
  headcount: number;
  headcountCostMonthly: number;
  debtInterestMonthly: number;
  depreciationMonthly: number;
};

export type ExampleCompany = {
  periods: Array<{ anio: number; periodo: number }>;
  cuentas: ExampleAccount[];
  catalogo: Array<{ idCuenta: string; nombreCuenta: string }>;
  balanza: ExampleBalanzaRow[];
  ventas: ExampleVenta[];
  egresos: ExampleEgreso[];
  flujos: ExampleFlujo[];
  flujoDetalle: ExampleFlujoDetalle[];
  auxMovimientos: ExampleAuxMovimiento[];
  auxResumen: ExampleAuxResumen[];
  polizas: ExamplePoliza[];
  polizaMovimientos: ExamplePolizaMovimiento[];
  budgetAssumptions: ExampleBudgetAssumption[];
};

// ---------------------------------------------------------------------------
// Catálogo (estilo CONTPAQi/Compac; los prefijos son los que ya lee el producto)
// ---------------------------------------------------------------------------

const BANCO = "1101-001-000";
const CAJA = "1101-002-000";
const INVENTARIO = "1107-001-000";
const EQUIPO = "1201-001-000";
const DEP_ACUM = "1202-001-000";
const IVA_POR_PAGAR = "2104-001-000";
const ISR_POR_PAGAR = "2105-001-000";
const PRESTAMO = "2106-001-000";
const CAPITAL = "3101-001-000";
const RESULTADOS_ANT = "3105-001-000";
const VENTAS_A = "4101-001-000";
const VENTAS_B = "4101-002-000";
const COSTO = "5101-001-000";
const SUELDOS_VENTA = "6101-001-000";
const PUBLICIDAD = "6101-002-000";
const FLETES = "6101-003-000";
const SUELDOS_ADMIN = "6201-001-000";
const RENTA = "6201-002-000";
const HONORARIOS = "6201-003-000";
const SERVICIOS = "6201-004-000";
const EXTRAORDINARIO = "6201-005-000";
const DEPRECIACION = "6301-001-000";
const ISR = "6406-001-000";
const INTERESES = "8101-001-000";

type ClienteDef = {
  id: string;
  nombre: string;
  cuenta: string;
  base: number;
  dia: number;
  lag: number;
  linea: string;
  ingreso: string;
};

const CLIENTES: ClienteDef[] = [
  { id: "C001", nombre: "Cliente Ejemplo Norte", cuenta: "1105-001-000", base: 190_000, dia: 8, lag: 28, linea: "Ferretería", ingreso: VENTAS_A },
  { id: "C002", nombre: "Cliente Ejemplo Centro", cuenta: "1105-002-000", base: 150_000, dia: 12, lag: 35, linea: "Ferretería", ingreso: VENTAS_A },
  { id: "C003", nombre: "Cliente Ejemplo Sur", cuenta: "1105-003-000", base: 120_000, dia: 15, lag: 45, linea: "Construcción ligera", ingreso: VENTAS_B },
  { id: "C004", nombre: "Cliente Ejemplo Bajío", cuenta: "1105-004-000", base: 90_000, dia: 18, lag: 62, linea: "Construcción ligera", ingreso: VENTAS_B },
  { id: "C005", nombre: "Cliente Ejemplo Costa", cuenta: "1105-005-000", base: 60_000, dia: 22, lag: 40, linea: "Ferretería", ingreso: VENTAS_A },
];

type ProveedorDef = {
  id: string;
  nombre: string;
  cuenta: string;
  dia: number;
  lag: number;
  plazo: number;
};

const PROVEEDORES: ProveedorDef[] = [
  { id: "P001", nombre: "Proveedor Ejemplo Acero", cuenta: "2101-001-000", dia: 5, lag: 32, plazo: 30 },
  { id: "P002", nombre: "Proveedor Ejemplo Tornillos", cuenta: "2101-002-000", dia: 10, lag: 40, plazo: 45 },
  { id: "P003", nombre: "Proveedor Ejemplo Pinturas", cuenta: "2101-003-000", dia: 20, lag: 35, plazo: 30 },
  { id: "P004", nombre: "Proveedor Ejemplo Servicios", cuenta: "2101-004-000", dia: 1, lag: 8, plazo: 15 },
  { id: "P005", nombre: "Proveedor Ejemplo Montacargas", cuenta: "2101-005-000", dia: 14, lag: 30, plazo: 30 },
];

export const EXAMPLE_ACCOUNTS: ExampleAccount[] = [
  { idCuenta: BANCO, nombreCuenta: "Banco Ejemplo, cuenta principal", categoria: "Activo" },
  { idCuenta: CAJA, nombreCuenta: "Caja chica de ejemplo", categoria: "Activo" },
  ...CLIENTES.map((c) => ({ idCuenta: c.cuenta, nombreCuenta: c.nombre, categoria: "Activo" as const })),
  { idCuenta: INVENTARIO, nombreCuenta: "Inventario de mercancía (ejemplo)", categoria: "Activo" },
  { idCuenta: EQUIPO, nombreCuenta: "Equipo de reparto y bodega (ejemplo)", categoria: "Activo" },
  { idCuenta: DEP_ACUM, nombreCuenta: "Depreciación acumulada del equipo (ejemplo)", categoria: "Activo" },
  ...PROVEEDORES.map((p) => ({ idCuenta: p.cuenta, nombreCuenta: p.nombre, categoria: "Pasivo" as const })),
  { idCuenta: IVA_POR_PAGAR, nombreCuenta: "IVA por pagar (ejemplo)", categoria: "Pasivo" },
  { idCuenta: ISR_POR_PAGAR, nombreCuenta: "ISR por pagar (ejemplo)", categoria: "Pasivo" },
  { idCuenta: PRESTAMO, nombreCuenta: "Préstamo bancario de ejemplo", categoria: "Pasivo" },
  { idCuenta: CAPITAL, nombreCuenta: "Capital social (ejemplo)", categoria: "Patrimonio" },
  { idCuenta: RESULTADOS_ANT, nombreCuenta: "Resultados de ejercicios anteriores (ejemplo)", categoria: "Patrimonio" },
  { idCuenta: VENTAS_A, nombreCuenta: "Ventas línea ferretería (ejemplo)", categoria: "Ingreso" },
  { idCuenta: VENTAS_B, nombreCuenta: "Ventas línea construcción ligera (ejemplo)", categoria: "Ingreso" },
  { idCuenta: COSTO, nombreCuenta: "Costo de ventas (ejemplo)", categoria: "COGS" },
  { idCuenta: SUELDOS_VENTA, nombreCuenta: "Sueldos de ventas (ejemplo)", categoria: "OpEx" },
  { idCuenta: PUBLICIDAD, nombreCuenta: "Publicidad y promoción (ejemplo)", categoria: "OpEx" },
  { idCuenta: FLETES, nombreCuenta: "Fletes y combustible (ejemplo)", categoria: "OpEx" },
  { idCuenta: SUELDOS_ADMIN, nombreCuenta: "Sueldos de administración (ejemplo)", categoria: "OpEx" },
  { idCuenta: RENTA, nombreCuenta: "Renta de bodega (ejemplo)", categoria: "OpEx" },
  { idCuenta: HONORARIOS, nombreCuenta: "Honorarios contables (ejemplo)", categoria: "OpEx" },
  { idCuenta: SERVICIOS, nombreCuenta: "Luz, agua y teléfono (ejemplo)", categoria: "OpEx" },
  { idCuenta: EXTRAORDINARIO, nombreCuenta: "Reparación extraordinaria de bodega (ejemplo)", categoria: "OpEx" },
  { idCuenta: DEPRECIACION, nombreCuenta: "Depreciación del ejercicio (ejemplo)", categoria: "OpEx", da: true },
  { idCuenta: ISR, nombreCuenta: "ISR del ejercicio (ejemplo)", categoria: "OpEx" },
  { idCuenta: INTERESES, nombreCuenta: "Intereses del préstamo (ejemplo)", categoria: "OpEx" },
];

/** Nombres de las cuentas de mayor (solo código y nombre; nunca entran a las sumas). */
export const EXAMPLE_CATALOGO: Array<{ idCuenta: string; nombreCuenta: string }> = [
  ["1101-000-000", "Caja y bancos"],
  ["1105-000-000", "Clientes"],
  ["1107-000-000", "Inventarios"],
  ["1201-000-000", "Equipo de reparto y bodega"],
  ["1202-000-000", "Depreciación acumulada"],
  ["2101-000-000", "Proveedores"],
  ["2104-000-000", "IVA por pagar"],
  ["2105-000-000", "Impuestos por pagar"],
  ["2106-000-000", "Préstamos bancarios"],
  ["3101-000-000", "Capital social"],
  ["3105-000-000", "Resultados de ejercicios anteriores"],
  ["4101-000-000", "Ventas"],
  ["5101-000-000", "Costo de ventas"],
  ["6101-000-000", "Gastos de venta"],
  ["6201-000-000", "Gastos de administración"],
  ["6301-000-000", "Depreciación"],
  ["6406-000-000", "ISR"],
  ["8101-000-000", "Gastos financieros"],
].map(([idCuenta, nombreCuenta]) => ({ idCuenta: idCuenta!, nombreCuenta: nombreCuenta! }));

// ---------------------------------------------------------------------------
// Utilidades de fecha y redondeo
// ---------------------------------------------------------------------------

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function daysInMonth(anio: number, periodo: number): number {
  return new Date(Date.UTC(anio, periodo, 0)).getUTCDate();
}

function isoDate(anio: number, periodo: number, dia: number): string {
  return `${anio}-${pad(periodo)}-${pad(Math.min(dia, daysInMonth(anio, periodo)))}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthOf(iso: string): { anio: number; periodo: number } {
  return { anio: Number(iso.slice(0, 4)), periodo: Number(iso.slice(5, 7)) };
}

function periodKey(anio: number, periodo: number): string {
  return `${anio}-${pad(periodo)}`;
}

/** Los 24 meses que terminan en `hasta` (el mes que acaba de cerrar), del más viejo al más nuevo. */
export function examplePeriods(hasta: { anio: number; periodo: number }, count = 24): Array<{ anio: number; periodo: number }> {
  const periods: Array<{ anio: number; periodo: number }> = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const index = hasta.anio * 12 + (hasta.periodo - 1) - offset;
    periods.push({ anio: Math.floor(index / 12), periodo: (index % 12) + 1 });
  }
  return periods;
}

/** Último mes cerrado respecto de `hoy`: el mes anterior al actual. */
export function lastClosedPeriod(hoy: Date): { anio: number; periodo: number } {
  const index = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth() - 1;
  return { anio: Math.floor(index / 12), periodo: (index % 12) + 1 };
}

// ---------------------------------------------------------------------------
// Supuestos de forma (para que se note que son de ejemplo)
// ---------------------------------------------------------------------------

/** Estacionalidad suave: mejor el último trimestre. */
const SEASON: Record<number, number> = { 1: 0.92, 2: 0.94, 3: 1.0, 4: 1.0, 5: 1.02, 6: 1.0, 7: 0.98, 8: 1.0, 9: 1.03, 10: 1.1, 11: 1.14, 12: 1.2 };
const TREND_PER_MONTH = 0.008;
const COSTO_PCT = 0.66;
const IVA_PCT = 0.16;
const ISR_PCT = 0.3;
/** Mes flojo (ventas) y mes con gasto extra: fijos en el calendario. */
const WEAK_MONTH = { anio: 2025, periodo: 3, factor: 0.65 };
const EXTRA_MONTH = { anio: 2025, periodo: 8, monto: 90_000 };
const OPENING = { banco: 450_000, caja: 15_000, equipo: 480_000, depAcum: 96_000, prestamo: 600_000 };
const LOAN_PRINCIPAL = 10_000;
const LOAN_RATE = 0.012;
const EQUIPO_MONTHLY_DEP = 4_000;
const CAPEX = { monto: 240_000, mesesAntesDelFin: 7, depMensual: 2_000 };

function plannedClientSubtotal(cliente: ClienteDef, idx: number, periodo: number): number {
  return roundTo(cliente.base * SEASON[periodo]! * (1 + TREND_PER_MONTH * idx), 1_000);
}

function isWeak(anio: number, periodo: number): boolean {
  return anio === WEAK_MONTH.anio && periodo === WEAK_MONTH.periodo;
}

function actualClientSubtotal(cliente: ClienteDef, idx: number, anio: number, periodo: number): number {
  const planned = plannedClientSubtotal(cliente, idx, periodo);
  return isWeak(anio, periodo) ? roundTo(planned * WEAK_MONTH.factor, 1_000) : planned;
}

function sueldosVenta(anio: number, periodo: number, base: number): number {
  const stepped = base + (anio >= 2026 ? 4_000 : anio >= 2025 ? 2_000 : 0);
  return periodo === 12 ? roundTo(stepped * 1.5, 500) : stepped;
}

function sueldosAdmin(anio: number, periodo: number): number {
  const stepped = anio >= 2026 ? 35_000 : anio >= 2025 ? 33_500 : 32_000;
  return periodo === 12 ? roundTo(stepped * 1.5, 500) : stepped;
}

function publicidad(periodo: number): number {
  return periodo >= 10 ? 9_000 : 6_000;
}

// ---------------------------------------------------------------------------
// Diario
// ---------------------------------------------------------------------------

type Kind = "ventas" | "compras" | "costo" | "cierreMes" | "cobranza" | "pagoProv" | "pagoGastos" | "pagoImpuestosDeuda" | "pagoEquipo";

const POLIZA_DEF: Record<Kind, { tipo: string; numero: number; concepto: string }> = {
  ventas: { tipo: "Dr", numero: 1, concepto: "Ventas del mes (ejemplo)" },
  compras: { tipo: "Dr", numero: 2, concepto: "Compras de mercancía y servicios (ejemplo)" },
  costo: { tipo: "Dr", numero: 3, concepto: "Costo de ventas del mes (ejemplo)" },
  cierreMes: { tipo: "Dr", numero: 4, concepto: "Depreciación y provisión de ISR del mes (ejemplo)" },
  cobranza: { tipo: "Ig", numero: 1, concepto: "Cobranza del mes (ejemplo)" },
  pagoProv: { tipo: "Eg", numero: 1, concepto: "Pagos a proveedores (ejemplo)" },
  pagoGastos: { tipo: "Eg", numero: 2, concepto: "Nómina, honorarios y gastos pagados (ejemplo)" },
  pagoImpuestosDeuda: { tipo: "Eg", numero: 3, concepto: "Impuestos, intereses y préstamo (ejemplo)" },
  pagoEquipo: { tipo: "Eg", numero: 4, concepto: "Pago de equipo (ejemplo)" },
};

type Line = { cuenta: string; cargo: number; abono: number; concepto: string; referencia: string };
type Event = { seq: number; fecha: string; kind: Kind; lines: Line[]; flujo?: { direccion: "ingreso" | "egreso"; key: string; label: string; monto: number; grupo: "operativa" | "capex" | "deuda" } };

type Invoice = { cliente: ClienteDef; folio: string; fecha: string; vence: string; subtotal: number; iva: number; cobrado: number; linea: string };
type Bill = { prov: ProveedorDef; folio: string; fecha: string; vence: string; subtotal: number; centro: string; clase: "Fijo" | "Variable"; inversion: "OpEx" | "CapEx"; pagado: boolean };

const accountsById = new Map(EXAMPLE_ACCOUNTS.map((account) => [account.idCuenta, account]));

function nameOf(cuenta: string): string {
  const account = accountsById.get(cuenta);
  if (!account) {
    throw new Error(`Cuenta fuera del catálogo de ejemplo: ${cuenta}`);
  }
  return account.nombreCuenta;
}

export function generateExampleCompany(hasta: { anio: number; periodo: number }): ExampleCompany {
  const periods = examplePeriods(hasta);
  const cutoff = isoDate(hasta.anio, hasta.periodo, 31);
  const events: Event[] = [];
  let seq = 0;
  const push = (event: Omit<Event, "seq">): void => {
    if (event.fecha > cutoff) {
      return;
    }
    seq += 1;
    events.push({ ...event, seq });
  };

  const invoices: Invoice[] = [];
  const bills: Bill[] = [];

  // Compra de equipo (CapEx): un mes fijo antes del cierre.
  const capexIndex = periods.length - 1 - CAPEX.mesesAntesDelFin;

  // Estimado del costo del primer mes para fijar el inventario inicial.
  const salesOf = (idx: number): number => {
    const { anio, periodo } = periods[idx]!;
    return CLIENTES.reduce((sum, c) => sum + actualClientSubtotal(c, idx, anio, periodo), 0);
  };
  const costoOf = (idx: number): number => roundTo(salesOf(idx) * COSTO_PCT, 1_000);
  // La meta de inventario sigue el plan de ventas, no el mes flojo: ese mes la mercancía se queda en bodega.
  const plannedCostoOf = (idx: number): number => {
    const { periodo } = periods[idx]!;
    return roundTo(CLIENTES.reduce((sum, c) => sum + plannedClientSubtotal(c, idx, periodo), 0) * COSTO_PCT, 1_000);
  };
  const inventoryTarget = (idx: number): number => roundTo(plannedCostoOf(idx) * 1.5, 5_000);
  const openingInventory = roundTo(plannedCostoOf(0) * 1.5, 5_000);

  let inventory = openingInventory;
  let loan = OPENING.prestamo;
  let ytdEbt = 0;
  let isrYtd = 0;
  let prevIva = 0;
  let prevIsr = 0;
  let depMonthly = EQUIPO_MONTHLY_DEP;
  const interestByMonth: number[] = [];

  periods.forEach(({ anio, periodo }, idx) => {
    if (periodo === 1) {
      ytdEbt = 0;
      isrYtd = 0;
    }
    const fin = isoDate(anio, periodo, 31);
    const tag = `${anio}${pad(periodo)}`;

    // 1) Ventas: una factura por cliente al mes.
    let salesSubtotal = 0;
    const sinPagoDesde = periods.length - 6;
    CLIENTES.forEach((cliente, cIdx) => {
      const subtotal = actualClientSubtotal(cliente, idx, anio, periodo);
      const iva = round2(subtotal * IVA_PCT);
      const total = round2(subtotal + iva);
      const fecha = isoDate(anio, periodo, cliente.dia);
      const folio = `EJ-V-${tag}-${pad(cIdx + 1)}`;
      salesSubtotal += subtotal;
      push({
        fecha,
        kind: "ventas",
        lines: [
          { cuenta: cliente.cuenta, cargo: total, abono: 0, concepto: `Factura ${folio}`, referencia: folio },
          { cuenta: cliente.ingreso, cargo: 0, abono: subtotal, concepto: `Venta ${folio}`, referencia: folio },
          { cuenta: IVA_POR_PAGAR, cargo: 0, abono: iva, concepto: `IVA ${folio}`, referencia: folio },
        ],
      });

      // Cobros: el cliente Costa deja de pagar en los últimos 6 meses; el Centro paga la mitad de su última factura.
      let cobrado = 0;
      const sinPago = cliente.id === "C005" && idx >= sinPagoDesde;
      if (!sinPago) {
        const parcial = cliente.id === "C002" && idx === periods.length - 2;
        const monto = parcial ? roundTo(total / 2, 100) : total;
        const fechaCobro = addDays(fecha, cliente.lag);
        if (fechaCobro <= cutoff) {
          cobrado = monto;
          push({
            fecha: fechaCobro,
            kind: "cobranza",
            flujo: { direccion: "ingreso", key: "cobranza", label: "Ingr. Cobranza", monto, grupo: "operativa" },
            lines: [
              { cuenta: BANCO, cargo: monto, abono: 0, concepto: `Cobro ${folio}`, referencia: folio },
              { cuenta: cliente.cuenta, cargo: 0, abono: monto, concepto: `Cobro ${folio}`, referencia: folio },
            ],
          });
        }
      }
      invoices.push({ cliente, folio, fecha, vence: addDays(fecha, 30), subtotal, iva, cobrado, linea: cliente.linea });
    });

    // 2) Costo de ventas y compras de mercancía (para llevar el inventario a su meta).
    const costo = costoOf(idx);
    const nextInventory = inventoryTarget(idx);
    const compras = costo + nextInventory - inventory;
    if (compras < 0) {
      throw new Error(`Compras negativas en ${periodKey(anio, periodo)}.`);
    }
    inventory = nextInventory;
    push({
      fecha: fin,
      kind: "costo",
      lines: [
        { cuenta: COSTO, cargo: costo, abono: 0, concepto: "Costo de ventas del mes", referencia: `EJ-COSTO-${tag}` },
        { cuenta: INVENTARIO, cargo: 0, abono: costo, concepto: "Salida de mercancía vendida", referencia: `EJ-COSTO-${tag}` },
      ],
    });

    const shares = [0.45, 0.3];
    const parts = [roundTo(compras * shares[0]!, 100), roundTo(compras * shares[1]!, 100)];
    parts.push(round2(compras - parts[0]! - parts[1]!));
    const addBill = (bill: Omit<Bill, "vence" | "pagado">, debitCuenta: string, flujoKey: string, flujoLabel: string, kind: "pagoProv" | "pagoEquipo"): void => {
      const vence = addDays(bill.fecha, bill.prov.plazo);
      const fechaPago = addDays(bill.fecha, bill.prov.lag);
      const pagado = fechaPago <= cutoff;
      bills.push({ ...bill, vence, pagado });
      push({
        fecha: bill.fecha,
        kind: "compras",
        lines: [
          { cuenta: debitCuenta, cargo: bill.subtotal, abono: 0, concepto: `Compra ${bill.folio}`, referencia: bill.folio },
          { cuenta: bill.prov.cuenta, cargo: 0, abono: bill.subtotal, concepto: `Factura ${bill.folio}`, referencia: bill.folio },
        ],
      });
      if (pagado) {
        push({
          fecha: fechaPago,
          kind,
          flujo: { direccion: "egreso", key: flujoKey, label: flujoLabel, monto: bill.subtotal, grupo: kind === "pagoEquipo" ? "capex" : "operativa" },
          lines: [
            { cuenta: bill.prov.cuenta, cargo: bill.subtotal, abono: 0, concepto: `Pago ${bill.folio}`, referencia: bill.folio },
            { cuenta: BANCO, cargo: 0, abono: bill.subtotal, concepto: `Pago ${bill.folio}`, referencia: bill.folio },
          ],
        });
      }
    };
    PROVEEDORES.slice(0, 3).forEach((prov, pIdx) => {
      addBill(
        { prov, folio: `EJ-E-${tag}-${prov.id}`, fecha: isoDate(anio, periodo, prov.dia), subtotal: parts[pIdx]!, centro: "Compras", clase: "Variable", inversion: "OpEx" },
        INVENTARIO,
        "proveedores",
        "Egr. Proveedores",
        "pagoProv",
      );
    });

    // 3) Renta y servicios (proveedor de servicios), y el equipo en su mes.
    const servicios = PROVEEDORES[3]!;
    addBill(
      { prov: servicios, folio: `EJ-E-${tag}-P004R`, fecha: isoDate(anio, periodo, 1), subtotal: 22_000, centro: "Administración", clase: "Fijo", inversion: "OpEx" },
      RENTA,
      "proveedores",
      "Egr. Proveedores",
      "pagoProv",
    );
    addBill(
      { prov: servicios, folio: `EJ-E-${tag}-P004S`, fecha: isoDate(anio, periodo, 12), subtotal: 9_000, centro: "Administración", clase: "Variable", inversion: "OpEx" },
      SERVICIOS,
      "proveedores",
      "Egr. Proveedores",
      "pagoProv",
    );
    if (idx === capexIndex) {
      addBill(
        { prov: PROVEEDORES[4]!, folio: `EJ-E-${tag}-P005`, fecha: isoDate(anio, periodo, PROVEEDORES[4]!.dia), subtotal: CAPEX.monto, centro: "Operaciones", clase: "Fijo", inversion: "CapEx" },
        EQUIPO,
        "compra-equipo",
        "Egr. Compra de equipo",
        "pagoEquipo",
      );
    }

    // 4) Gastos que se pagan en el mes.
    const gastoPagado = (fecha: string, cuenta: string, monto: number, key: string, label: string, concepto: string): void => {
      if (monto <= 0) {
        return;
      }
      push({
        fecha,
        kind: "pagoGastos",
        flujo: { direccion: "egreso", key, label, monto, grupo: "operativa" },
        lines: [
          { cuenta, cargo: monto, abono: 0, concepto, referencia: `EJ-G-${tag}` },
          { cuenta: BANCO, cargo: 0, abono: monto, concepto, referencia: `EJ-G-${tag}` },
        ],
      });
    };
    const sv = sueldosVenta(anio, periodo, 45_000);
    const sa = sueldosAdmin(anio, periodo);
    const pub = publicidad(periodo);
    const fletes = roundTo(salesSubtotal * 0.022, 500);
    const honorarios = 5_000;
    const extra = anio === EXTRA_MONTH.anio && periodo === EXTRA_MONTH.periodo ? EXTRA_MONTH.monto : 0;
    gastoPagado(isoDate(anio, periodo, 28), SUELDOS_VENTA, sv, "sueldos", "Egr. Sueldos", "Sueldos de ventas");
    gastoPagado(isoDate(anio, periodo, 28), SUELDOS_ADMIN, sa, "sueldos", "Egr. Sueldos", "Sueldos de administración");
    gastoPagado(isoDate(anio, periodo, 15), PUBLICIDAD, pub, "publicidad", "Egr. Publicidad", "Publicidad y promoción");
    gastoPagado(isoDate(anio, periodo, 20), FLETES, fletes, "diversos", "Egr. Diversos", "Fletes y combustible");
    gastoPagado(isoDate(anio, periodo, 25), HONORARIOS, honorarios, "honorarios", "Egr. Honorarios", "Honorarios contables");
    gastoPagado(isoDate(anio, periodo, 14), EXTRAORDINARIO, extra, "diversos", "Egr. Diversos", "Reparación extraordinaria de bodega");

    // 5) Depreciación, intereses, ISR (provisión) y su pago al mes siguiente.
    if (idx === capexIndex + 1) {
      depMonthly = EQUIPO_MONTHLY_DEP + CAPEX.depMensual;
    }
    const interes = roundTo(loan * LOAN_RATE, 100);
    interestByMonth.push(interes);
    const opex = sv + sa + pub + fletes + 22_000 + honorarios + 9_000 + extra + depMonthly;
    const ebt = salesSubtotal - costo - opex - interes;
    ytdEbt += ebt;
    const isr = Math.max(0, roundTo(ISR_PCT * ytdEbt - isrYtd, 100));
    isrYtd += isr;

    push({
      fecha: fin,
      kind: "cierreMes",
      lines: [
        { cuenta: DEPRECIACION, cargo: depMonthly, abono: 0, concepto: "Depreciación del mes", referencia: `EJ-DEP-${tag}` },
        { cuenta: DEP_ACUM, cargo: 0, abono: depMonthly, concepto: "Depreciación del mes", referencia: `EJ-DEP-${tag}` },
        ...(isr > 0
          ? [
              { cuenta: ISR, cargo: isr, abono: 0, concepto: "Provisión de ISR", referencia: `EJ-ISR-${tag}` },
              { cuenta: ISR_POR_PAGAR, cargo: 0, abono: isr, concepto: "Provisión de ISR", referencia: `EJ-ISR-${tag}` },
            ]
          : []),
      ],
    });

    const ivaMes = round2(salesSubtotal * IVA_PCT);
    if (prevIva > 0) {
      push({
        fecha: isoDate(anio, periodo, 17),
        kind: "pagoImpuestosDeuda",
        flujo: { direccion: "egreso", key: "impuestos", label: "Egr. Impuestos", monto: prevIva, grupo: "operativa" },
        lines: [
          { cuenta: IVA_POR_PAGAR, cargo: prevIva, abono: 0, concepto: "Pago de IVA del mes anterior", referencia: `EJ-IVA-${tag}` },
          { cuenta: BANCO, cargo: 0, abono: prevIva, concepto: "Pago de IVA del mes anterior", referencia: `EJ-IVA-${tag}` },
        ],
      });
    }
    if (prevIsr > 0) {
      push({
        fecha: isoDate(anio, periodo, 17),
        kind: "pagoImpuestosDeuda",
        flujo: { direccion: "egreso", key: "impuestos", label: "Egr. Impuestos", monto: prevIsr, grupo: "operativa" },
        lines: [
          { cuenta: ISR_POR_PAGAR, cargo: prevIsr, abono: 0, concepto: "Pago de ISR del mes anterior", referencia: `EJ-ISRP-${tag}` },
          { cuenta: BANCO, cargo: 0, abono: prevIsr, concepto: "Pago de ISR del mes anterior", referencia: `EJ-ISRP-${tag}` },
        ],
      });
    }
    prevIva = ivaMes;
    prevIsr = isr;

    push({
      fecha: isoDate(anio, periodo, 30),
      kind: "pagoImpuestosDeuda",
      flujo: { direccion: "egreso", key: "intereses", label: "Egr. Intereses", monto: interes, grupo: "deuda" },
      lines: [
        { cuenta: INTERESES, cargo: interes, abono: 0, concepto: "Intereses del préstamo", referencia: `EJ-INT-${tag}` },
        { cuenta: BANCO, cargo: 0, abono: interes, concepto: "Intereses del préstamo", referencia: `EJ-INT-${tag}` },
      ],
    });
    push({
      fecha: isoDate(anio, periodo, 30),
      kind: "pagoImpuestosDeuda",
      flujo: { direccion: "egreso", key: "pago-prestamos", label: "Egr. Pago de préstamos", monto: LOAN_PRINCIPAL, grupo: "deuda" },
      lines: [
        { cuenta: PRESTAMO, cargo: LOAN_PRINCIPAL, abono: 0, concepto: "Pago de capital del préstamo", referencia: `EJ-CAP-${tag}` },
        { cuenta: BANCO, cargo: 0, abono: LOAN_PRINCIPAL, concepto: "Pago de capital del préstamo", referencia: `EJ-CAP-${tag}` },
      ],
    });
    loan -= LOAN_PRINCIPAL;
  });

  // -------------------------------------------------------------------------
  // Derivados: balanza
  // -------------------------------------------------------------------------
  const byPeriod = new Map<string, Event[]>();
  for (const event of events) {
    const { anio, periodo } = monthOf(event.fecha);
    const key = periodKey(anio, periodo);
    const list = byPeriod.get(key) ?? [];
    list.push(event);
    byPeriod.set(key, list);
  }
  for (const list of byPeriod.values()) {
    list.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.seq - b.seq));
  }

  const opening = new Map<string, number>();
  for (const account of EXAMPLE_ACCOUNTS) {
    opening.set(account.idCuenta, 0);
  }
  opening.set(BANCO, OPENING.banco);
  opening.set(CAJA, OPENING.caja);
  opening.set(INVENTARIO, openingInventory);
  opening.set(EQUIPO, OPENING.equipo);
  opening.set(DEP_ACUM, -OPENING.depAcum);
  opening.set(PRESTAMO, -OPENING.prestamo);
  const activos = OPENING.banco + OPENING.caja + openingInventory + OPENING.equipo - OPENING.depAcum;
  opening.set(CAPITAL, -round2(activos - OPENING.prestamo));

  const isPnl = (categoria: ExampleCategory): boolean => categoria === "Ingreso" || categoria === "COGS" || categoria === "OpEx";

  // Presupuesto mensual sencillo por cuenta de resultados (magnitud positiva).
  const budgetFor = (cuenta: string, idx: number): number => {
    const { anio, periodo } = periods[idx]!;
    const planned = CLIENTES.reduce((sum, c) => sum + plannedClientSubtotal(c, idx, periodo), 0);
    switch (cuenta) {
      case VENTAS_A:
      case VENTAS_B:
        return CLIENTES.filter((c) => c.ingreso === cuenta).reduce((sum, c) => sum + plannedClientSubtotal(c, idx, periodo), 0);
      case COSTO:
        return roundTo(planned * COSTO_PCT, 1_000);
      case SUELDOS_VENTA:
        return sueldosVenta(anio, periodo, 45_000);
      case SUELDOS_ADMIN:
        return sueldosAdmin(anio, periodo);
      case PUBLICIDAD:
        return publicidad(periodo);
      case FLETES:
        return roundTo(planned * 0.022, 500);
      case RENTA:
        return 22_000;
      case HONORARIOS:
        return 5_000;
      case SERVICIOS:
        return 9_000;
      case DEPRECIACION:
        return idx > capexIndex ? EQUIPO_MONTHLY_DEP + CAPEX.depMensual : EQUIPO_MONTHLY_DEP;
      case INTERESES:
        return interestByMonth[idx] ?? 0;
      default:
        return 0;
    }
  };

  const balanza: ExampleBalanzaRow[] = [];
  let carry = new Map(opening);
  periods.forEach(({ anio, periodo }, idx) => {
    const list = byPeriod.get(periodKey(anio, periodo)) ?? [];
    const debe = new Map<string, number>();
    const haber = new Map<string, number>();
    for (const event of list) {
      for (const line of event.lines) {
        debe.set(line.cuenta, round2((debe.get(line.cuenta) ?? 0) + line.cargo));
        haber.set(line.cuenta, round2((haber.get(line.cuenta) ?? 0) + line.abono));
      }
    }

    const inicial = new Map<string, number>();
    if (idx === 0) {
      for (const account of EXAMPLE_ACCOUNTS) {
        inicial.set(account.idCuenta, opening.get(account.idCuenta) ?? 0);
      }
    } else {
      const yearResult = round2(
        EXAMPLE_ACCOUNTS.filter((a) => isPnl(a.categoria)).reduce((sum, a) => sum + (carry.get(a.idCuenta) ?? 0), 0),
      );
      for (const account of EXAMPLE_ACCOUNTS) {
        let value = carry.get(account.idCuenta) ?? 0;
        if (periodo === 1) {
          if (isPnl(account.categoria)) {
            value = 0;
          } else if (account.idCuenta === RESULTADOS_ANT) {
            value = round2(value + yearResult);
          }
        }
        inicial.set(account.idCuenta, value);
      }
    }

    const next = new Map<string, number>();
    for (const account of EXAMPLE_ACCOUNTS) {
      const ini = inicial.get(account.idCuenta) ?? 0;
      const d = debe.get(account.idCuenta) ?? 0;
      const h = haber.get(account.idCuenta) ?? 0;
      const fin = round2(ini + d - h);
      next.set(account.idCuenta, fin);
      balanza.push({
        idCuenta: account.idCuenta,
        nombreCuenta: account.nombreCuenta,
        categoriaMaestra: account.categoria,
        saldoInicial: ini,
        debe: d,
        haber: h,
        saldoFinal: fin,
        montoPresupuestado: isPnl(account.categoria) ? budgetFor(account.idCuenta, idx) : 0,
        depreciacionAmortizacion: Boolean(account.da),
        anio,
        periodo,
      });
    }
    carry = next;
  });

  // -------------------------------------------------------------------------
  // Derivados: facturas
  // -------------------------------------------------------------------------
  const ventas: ExampleVenta[] = invoices.map((invoice) => {
    const total = round2(invoice.subtotal + invoice.iva);
    return {
      idCliente: invoice.cliente.id,
      nombreCliente: invoice.cliente.nombre,
      folioFactura: invoice.folio,
      fechaEmision: invoice.fecha,
      fechaVencimiento: invoice.vence,
      montoSubtotal: invoice.subtotal,
      iva: invoice.iva,
      montoCobrado: invoice.cobrado,
      estatusPago: invoice.cobrado >= total - 0.01 ? "Pagado" : "Pendiente",
      lineaNegocio: invoice.linea,
    };
  });
  const egresos: ExampleEgreso[] = bills.map((bill) => ({
    idProveedor: bill.prov.id,
    nombreProveedor: bill.prov.nombre,
    folioDocumento: bill.folio,
    fechaEmision: bill.fecha,
    fechaVencimiento: bill.vence,
    montoSubtotal: bill.subtotal,
    centroDeCostos: bill.centro,
    clasificacionGasto: bill.clase,
    tipoInversion: bill.inversion,
    estatusPago: bill.pagado ? "Pagado" : "Pendiente",
  }));

  // -------------------------------------------------------------------------
  // Derivados: pólizas (una por tipo de evento y mes, con todo su detalle)
  // -------------------------------------------------------------------------
  const polizas: ExamplePoliza[] = [];
  const polizaMovimientos: ExamplePolizaMovimiento[] = [];
  const auxMovimientos: ExampleAuxMovimiento[] = [];
  const terceros = new Map<string, { nombre: string; tipo: "CLIENTE" | "PROVEEDOR" }>();
  CLIENTES.forEach((c) => terceros.set(c.cuenta, { nombre: c.nombre, tipo: "CLIENTE" }));
  PROVEEDORES.forEach((p) => terceros.set(p.cuenta, { nombre: p.nombre, tipo: "PROVEEDOR" }));
  const running = new Map<string, number>();
  const resumenAcc = new Map<string, { ini: number; cargos: number; abonos: number }>();
  const auxResumen: ExampleAuxResumen[] = [];

  periods.forEach(({ anio, periodo }) => {
    const key = periodKey(anio, periodo);
    const list = byPeriod.get(key) ?? [];
    const kinds = (Object.keys(POLIZA_DEF) as Kind[]).sort((a, b) => {
      const da = POLIZA_DEF[a];
      const db = POLIZA_DEF[b];
      return da.tipo === db.tipo ? da.numero - db.numero : da.tipo < db.tipo ? -1 : 1;
    });

    for (const [cuenta] of terceros) {
      resumenAcc.set(cuenta, { ini: running.get(cuenta) ?? 0, cargos: 0, abonos: 0 });
    }

    for (const kind of kinds) {
      const def = POLIZA_DEF[kind];
      const own = list.filter((event) => event.kind === kind);
      if (own.length === 0) {
        continue;
      }
      let totalCargos = 0;
      let totalAbonos = 0;
      let n = 0;
      for (const event of own) {
        for (const line of event.lines) {
          n += 1;
          totalCargos = round2(totalCargos + line.cargo);
          totalAbonos = round2(totalAbonos + line.abono);
          polizaMovimientos.push({
            anio,
            periodo,
            tipoPoliza: def.tipo,
            numeroPoliza: def.numero,
            numeroMovimiento: n,
            codigoCuenta: line.cuenta,
            nombreCuenta: nameOf(line.cuenta),
            referencia: line.referencia,
            concepto: line.concepto,
            cargo: line.cargo,
            abono: line.abono,
          });
          const tercero = terceros.get(line.cuenta);
          if (tercero) {
            // Clientes: deudor positivo. Proveedores: magnitud positiva (abonos suman).
            const delta = tercero.tipo === "CLIENTE" ? line.cargo - line.abono : line.abono - line.cargo;
            const saldo = round2((running.get(line.cuenta) ?? 0) + delta);
            running.set(line.cuenta, saldo);
            const acc = resumenAcc.get(line.cuenta)!;
            acc.cargos = round2(acc.cargos + line.cargo);
            acc.abonos = round2(acc.abonos + line.abono);
            auxMovimientos.push({
              anio,
              periodo,
              moneda: "MXN",
              idCuenta: line.cuenta,
              nombreCuenta: tercero.nombre,
              fecha: event.fecha,
              tipoPoliza: def.tipo,
              numeroPoliza: String(def.numero),
              concepto: line.concepto,
              referencia: line.referencia,
              cargos: line.cargo,
              abonos: line.abono,
              saldo,
            });
          }
        }
      }
      polizas.push({
        anio,
        periodo,
        tipo: def.tipo,
        numero: def.numero,
        fecha: isoDate(anio, periodo, 31),
        concepto: def.concepto,
        totalCargos,
        totalAbonos,
        cuadrada: Math.abs(totalCargos - totalAbonos) < 0.01,
        movimientosCount: n,
      });
    }

    for (const [cuenta, tercero] of terceros) {
      const acc = resumenAcc.get(cuenta)!;
      auxResumen.push({
        anio,
        periodo,
        moneda: "MXN",
        idCuenta: cuenta,
        nombreCuenta: tercero.nombre,
        saldoInicial: acc.ini,
        cargos: acc.cargos,
        abonos: acc.abonos,
        saldoFinal: running.get(cuenta) ?? 0,
      });
    }
  });

  // -------------------------------------------------------------------------
  // Derivados: flujo de efectivo (sale de las mismas líneas del banco)
  // -------------------------------------------------------------------------
  const flujos: ExampleFlujo[] = [];
  const flujoDetalle: ExampleFlujoDetalle[] = [];
  let bancoSaldo = OPENING.banco;
  periods.forEach(({ anio, periodo }) => {
    const list = byPeriod.get(periodKey(anio, periodo)) ?? [];
    const acumulado = new Map<string, { direccion: "ingreso" | "egreso"; label: string; monto: number }>();
    let entradas = 0;
    let salidasOperativas = 0;
    let capex = 0;
    let deuda = 0;
    for (const event of list) {
      if (!event.flujo) {
        continue;
      }
      const { direccion, key, label, monto, grupo } = event.flujo;
      const slot = acumulado.get(`${direccion}|${key}`) ?? { direccion, label, monto: 0 };
      slot.monto = round2(slot.monto + monto);
      acumulado.set(`${direccion}|${key}`, slot);
      if (direccion === "ingreso") {
        entradas = round2(entradas + monto);
      } else if (grupo === "capex") {
        capex = round2(capex + monto);
      } else if (grupo === "deuda") {
        deuda = round2(deuda + monto);
      } else {
        salidasOperativas = round2(salidasOperativas + monto);
      }
    }
    const saldoFinal = round2(bancoSaldo + entradas - salidasOperativas - capex - deuda);
    flujos.push({ anio, periodo, idBancoCaja: BANCO, saldoInicialPeriodo: bancoSaldo, entradasOperativas: entradas, salidasOperativas, salidasCapex: capex, servicioDeuda: deuda, saldoFinalPeriodo: saldoFinal });
    flujos.push({ anio, periodo, idBancoCaja: CAJA, saldoInicialPeriodo: OPENING.caja, entradasOperativas: 0, salidasOperativas: 0, salidasCapex: 0, servicioDeuda: 0, saldoFinalPeriodo: OPENING.caja });
    let orden = 0;
    for (const direccion of ["ingreso", "egreso"] as const) {
      for (const [mapKey, slot] of acumulado) {
        if (slot.direccion !== direccion) {
          continue;
        }
        orden += 1;
        flujoDetalle.push({
          anio,
          periodo,
          idBancoCaja: BANCO,
          direccion,
          categoriaKey: mapKey.split("|")[1]!,
          labelOrigen: slot.label,
          monto: slot.monto,
          esTraspaso: false,
          orden,
        });
      }
    }
    bancoSaldo = saldoFinal;
  });

  // -------------------------------------------------------------------------
  // Supuestos de presupuesto del año en curso
  // -------------------------------------------------------------------------
  const lastInterest = interestByMonth[interestByMonth.length - 1] ?? 0;
  const budgetAssumptions: ExampleBudgetAssumption[] = [
    {
      anio: hasta.anio,
      salesGrowthPct: 9,
      inflationPct: 3.5,
      headcount: 4,
      headcountCostMonthly: 21_000,
      debtInterestMonthly: lastInterest,
      depreciationMonthly: EQUIPO_MONTHLY_DEP + CAPEX.depMensual,
    },
  ];

  return {
    periods,
    cuentas: EXAMPLE_ACCOUNTS,
    catalogo: EXAMPLE_CATALOGO,
    balanza,
    ventas,
    egresos,
    flujos,
    flujoDetalle,
    auxMovimientos,
    auxResumen,
    polizas,
    polizaMovimientos,
    budgetAssumptions,
  };
}
