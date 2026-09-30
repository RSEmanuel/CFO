import { classifyErCuenta, computeErBuckets, type ErBuckets } from "@/services/estadoOperativo";
import { selectLeafCodes } from "@/services/ingest/leafAccounts";
import { round2 } from "@/services/money";

/**
 * RIF & Auditoría — lógica pura (sin DB).
 *
 * MAPEO spec-SAT ↔ catálogo real Compac del tenant (verificado en DB,
 * balanzas_pnl 2024-08 → 2026-07):
 *
 * | Spec SAT (genérico)        | Cuenta real Compac                          |
 * |----------------------------|---------------------------------------------|
 * | 701 Intereses a cargo      | 8101-0002 INTERESES A CARGO BANCARIOS       |
 * | 702 Comisiones financieras | 8101-0010 Comisiones bancarias              |
 * | 701/702 Otros gastos fin.  | 8101-0011 Otros gastos financieros          |
 * | 801 Pérdida cambiaria      | 8101-0001 Pérdida cambiaria                 |
 * | 802 Utilidad cambiaria     | 7102-0001 Utilidad cambiaria                |
 * | 107 Otros productos fin.   | 7102-0002/0010, 7104-0022/0023              |
 * | 206 ISR                    | 6406-0001 Impuesto sobre la renta           |
 * | 216 PTU                    | 6405-0001 Participación de los trabajadores |
 *
 * El match NO es por código fijo sino por prefijo de clase (8101/7102/7104)
 * + palabra clave del nombre, para que otros tenants con subcuentas
 * distintas queden cubiertos. `satRefRif` solo etiqueta; la agregación
 * canónica sigue siendo `computeErBuckets` (estadoOperativo.ts), así el
 * desglose cuadra con el ER Operativo por construcción.
 *
 * CUENTAS PUENTE (health-check), clases detectadas por prefijo + nombre:
 * - anticiposClientes: 2xxx con "anticipo" en el nombre o prefijo 2306
 *   (catálogo real: 2306-0001 Anticipo de cliente nacional). Las cuentas
 *   2107 "ANT. ..." son anticipos de acreedores/proveedores, NO de clientes,
 *   y quedan fuera de esta clase por diseño.
 * - impuestosPorEnterar: 21xx con nombre fiscal (ISR/IMSS/IVA/PTU/INFONAVIT/
 *   SAR/nómina/retención/impuesto). Cubre 2108/2109 (IVA trasladado), 2111
 *   (provisiones IMSS/SAR/INFONAVIT), 2113 (impuestos por pagar), 2115 (PTU)
 *   y 2116 (retenciones). 2359 "Otros impuestos diferidos" es largo plazo y
 *   queda fuera. 2110 "Provisión sueldos y salarios" no es fiscal y queda
 *   fuera.
 * - funcionariosEmpleados: prefijo 1107 (Deudores diversos: préstamos a
 *   empleados/funcionarios y otros deudores; el catálogo no separa una
 *   cuenta "Funcionarios y empleados") u 11xx con nombre funcionario/empleado.
 *
 * REGLAS DEL SEMÁFORO (por cuenta hoja; la clase hereda el peor estado):
 * - sinCuentas: la clase no existe en el catálogo del periodo (fila atenuada).
 * - verde: |saldo| ≤ $1.00 (tolerancia de redondeo).
 * - ámbar: saldo presente; se anota además "saldoCreciente" cuando |saldo|
 *   crece vs el mes anterior (riesgo acumulándose).
 * - rojo: saldo presente Y la cuenta tiene auxiliares con último movimiento
 *   a más de 60 días del cierre del periodo (saldo envejecido/estacionado).
 *   Sin auxiliares no se puede fechar el saldo → no aplica rojo por
 *   antigüedad y la cuenta queda en ámbar.
 */

export const RIF_GASTOS_PREFIX = "8101";
export const RIF_PRODUCTOS_PREFIXES = ["7102", "7104"] as const;

export const PUENTE_SALDO_TOL = 1;
export const PUENTE_ANTIGUEDAD_ROJA_DIAS = 60;

export type RifBalanzaRow = {
  idCuenta: string;
  nombreCuenta: string;
  debe: number;
  haber: number;
  saldoFinal: number;
  anio: number;
  periodo: number;
};

export type PeriodoRef = { anio: number; mes: number };

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function firstSegment(idCuenta: string): string {
  return idCuenta.trim().split(/[-.]/).filter((segment) => segment.length > 0)[0] ?? "";
}

/** Etiqueta SAT del desglose RIF (ver tabla del encabezado del módulo). */
export function satRefRif(idCuenta: string, nombreCuenta: string): string {
  const segment = firstSegment(idCuenta);
  const nombre = normalizeText(nombreCuenta);
  if (segment.startsWith(RIF_GASTOS_PREFIX)) {
    if (nombre.includes("cambiar")) return "SAT 801";
    if (nombre.includes("interes")) return "SAT 701";
    if (nombre.includes("comision")) return "SAT 702";
    return "SAT 701/702";
  }
  if (nombre.includes("cambiar")) return "SAT 802";
  return "SAT 107";
}

export type RifNaturaleza = "gasto" | "producto";

export type RifSubcuentaRow = {
  idCuenta: string;
  nombreCuenta: string;
  naturaleza: RifNaturaleza;
  satRef: string;
  /** Convención económica: gasto positivo = costo; producto positivo = ingreso. */
  ytd: number;
  mes: number;
  mesAnterior: number | null;
  variacion: number | null;
};

export type RifTotales = {
  ytd: number;
  mes: number;
  mesAnterior: number | null;
  variacion: number | null;
};

export type RifMesPoint = {
  anio: number;
  periodo: number;
  gastos: number;
  productos: number;
  rifNeto: number;
};

export type RifDesglose = {
  filas: RifSubcuentaRow[];
  totalGastos: RifTotales;
  totalProductos: RifTotales;
  rifNeto: RifTotales;
  /** Ventas del ER canónico por columna; base del modo % de la tabla. */
  ventas: { ytd: number; mes: number; mesAnterior: number | null };
  serieMensual: RifMesPoint[];
};

function sumScope(
  rows: RifBalanzaRow[],
  scope: (row: RifBalanzaRow) => boolean,
): Map<string, { idCuenta: string; nombreCuenta: string; debe: number; haber: number }> {
  const byCuenta = new Map<string, { idCuenta: string; nombreCuenta: string; debe: number; haber: number }>();
  for (const row of rows) {
    if (!scope(row)) continue;
    const acc = byCuenta.get(row.idCuenta) ?? {
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      debe: 0,
      haber: 0,
    };
    acc.debe += row.debe;
    acc.haber += row.haber;
    byCuenta.set(row.idCuenta, acc);
  }
  return byCuenta;
}

/** Monto económico de una cuenta RIF: gasto = debe − haber; producto = haber − debe. */
function montoRif(naturaleza: RifNaturaleza, debe: number, haber: number): number {
  return naturaleza === "gasto" ? round2(debe - haber) : round2(haber - debe);
}

function naturalezaRif(idCuenta: string): RifNaturaleza | null {
  const clase = classifyErCuenta(idCuenta);
  if (clase === "gastosFinancieros") return "gasto";
  if (clase === "productosFinancieros") return "producto";
  return null;
}

function buildTotales(filas: RifSubcuentaRow[], naturaleza: RifNaturaleza): RifTotales {
  const scope = filas.filter((fila) => fila.naturaleza === naturaleza);
  const ytd = round2(scope.reduce((sum, fila) => sum + fila.ytd, 0));
  const mes = round2(scope.reduce((sum, fila) => sum + fila.mes, 0));
  const hasPrior = scope.some((fila) => fila.mesAnterior != null);
  const mesAnterior = hasPrior ? round2(scope.reduce((sum, fila) => sum + (fila.mesAnterior ?? 0), 0)) : null;
  return {
    ytd,
    mes,
    mesAnterior,
    variacion: mesAnterior == null ? null : round2(mes - mesAnterior),
  };
}

/**
 * Desglose del RIF por subcuenta + serie mensual. Usa la misma selección de
 * hojas y clasificación que el ER canónico, así Σ subcuentas ≡ buckets del ER.
 */
export function computeRifDesglose(input: {
  rows: RifBalanzaRow[];
  target: PeriodoRef;
  prior: PeriodoRef;
  /** Periodos de la serie (asc); típicamente los últimos 12 con balanza. */
  seriePeriodos: PeriodoRef[];
}): RifDesglose {
  const { rows, target, prior, seriePeriodos } = input;
  const leafSet = selectLeafCodes([...new Set(rows.map((row) => row.idCuenta))]);

  const ytdMap = sumScope(rows, (row) => row.anio === target.anio && row.periodo <= target.mes);
  const mesMap = sumScope(rows, (row) => row.anio === target.anio && row.periodo === target.mes);
  const priorMap = sumScope(rows, (row) => row.anio === prior.anio && row.periodo === prior.mes);

  const codes = [...new Set([...ytdMap.keys(), ...mesMap.keys(), ...priorMap.keys()])]
    .filter((code) => leafSet.has(code))
    .filter((code) => naturalezaRif(code) != null)
    .sort((a, b) => a.localeCompare(b, "es"));

  const filas: RifSubcuentaRow[] = codes.map((code) => {
    const naturaleza = naturalezaRif(code)!;
    const ytdRow = ytdMap.get(code);
    const mesRow = mesMap.get(code);
    const priorRow = priorMap.get(code);
    const ytd = ytdRow ? montoRif(naturaleza, ytdRow.debe, ytdRow.haber) : 0;
    const mes = mesRow ? montoRif(naturaleza, mesRow.debe, mesRow.haber) : 0;
    const mesAnterior = priorRow ? montoRif(naturaleza, priorRow.debe, priorRow.haber) : null;
    return {
      idCuenta: code,
      nombreCuenta: ytdRow?.nombreCuenta ?? mesRow?.nombreCuenta ?? priorRow?.nombreCuenta ?? code,
      naturaleza,
      satRef: satRefRif(code, ytdRow?.nombreCuenta ?? mesRow?.nombreCuenta ?? priorRow?.nombreCuenta ?? ""),
      ytd,
      mes,
      mesAnterior,
      variacion: mesAnterior == null ? null : round2(mes - mesAnterior),
    };
  });

  const totalGastos = buildTotales(filas, "gasto");
  const totalProductos = buildTotales(filas, "producto");
  const rifNeto: RifTotales = {
    ytd: round2(totalProductos.ytd - totalGastos.ytd),
    mes: round2(totalProductos.mes - totalGastos.mes),
    mesAnterior:
      totalProductos.mesAnterior == null || totalGastos.mesAnterior == null
        ? null
        : round2(totalProductos.mesAnterior - totalGastos.mesAnterior),
    variacion:
      totalProductos.mesAnterior == null || totalGastos.mesAnterior == null
        ? null
        : round2(
            totalProductos.mes - totalGastos.mes - (totalProductos.mesAnterior - totalGastos.mesAnterior),
          ),
  };

  const bucketsYtd = computeErBuckets(
    rows
      .filter((row) => row.anio === target.anio && row.periodo <= target.mes)
      .map((row) => ({ idCuenta: row.idCuenta, nombreCuenta: row.nombreCuenta, debe: row.debe, haber: row.haber })),
  );
  const bucketsMes = computeErBuckets(
    rows
      .filter((row) => row.anio === target.anio && row.periodo === target.mes)
      .map((row) => ({ idCuenta: row.idCuenta, nombreCuenta: row.nombreCuenta, debe: row.debe, haber: row.haber })),
  );
  const priorRows = rows.filter((row) => row.anio === prior.anio && row.periodo === prior.mes);
  const bucketsPrior = priorRows.length
    ? computeErBuckets(
        priorRows.map((row) => ({
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          debe: row.debe,
          haber: row.haber,
        })),
      )
    : null;

  const serieMensual: RifMesPoint[] = seriePeriodos.map(({ anio, mes }) => {
    const monthRows = rows.filter((row) => row.anio === anio && row.periodo === mes);
    const buckets = computeErBuckets(
      monthRows.map((row) => ({
        idCuenta: row.idCuenta,
        nombreCuenta: row.nombreCuenta,
        debe: row.debe,
        haber: row.haber,
      })),
    );
    return {
      anio,
      periodo: mes,
      gastos: buckets.gastosFinancieros,
      productos: buckets.productosFinancieros,
      rifNeto: buckets.rif,
    };
  });

  return {
    filas,
    totalGastos,
    totalProductos,
    rifNeto,
    ventas: { ytd: bucketsYtd.ventas, mes: bucketsMes.ventas, mesAnterior: bucketsPrior?.ventas ?? null },
    serieMensual,
  };
}

export type ImpuestoMonitoreado = {
  key: "isr" | "ptu";
  satRef: string;
  mes: number;
  ytd: number;
  /** true cuando ni el mes ni el YTD registran provisión (no se muestra $0.00). */
  sinProvision: boolean;
};

export type TasaEfectivaNota = "sinProvisionIsr" | "ebtSinUtilidad" | null;

export type ImpuestosMonitor = {
  isr: ImpuestoMonitoreado;
  ptu: ImpuestoMonitoreado;
  ebtMes: number;
  ebtYtd: number;
  /** ISR YTD / EBT YTD del ER canónico; ISR = 0 → 0% con nota documentada. */
  tasaEfectivaYtd: number | null;
  tasaEfectivaMes: number | null;
  notaTasa: TasaEfectivaNota;
};

const IMPUESTO_TOL = 0.005;

function tasaEfectiva(isr: number, ebt: number): { tasa: number | null; nota: TasaEfectivaNota } {
  if (Math.abs(isr) <= IMPUESTO_TOL) {
    return { tasa: 0, nota: "sinProvisionIsr" };
  }
  if (ebt <= IMPUESTO_TOL) {
    return { tasa: null, nota: "ebtSinUtilidad" };
  }
  return { tasa: round2((isr / ebt) * 100), nota: null };
}

/** Monitor de impuestos directo de los buckets canónicos del ER (6405/6406). */
export function computeImpuestosMonitor(bucketsMes: ErBuckets, bucketsYtd: ErBuckets): ImpuestosMonitor {
  const ytd = tasaEfectiva(bucketsYtd.isr, bucketsYtd.ebt);
  const mes = tasaEfectiva(bucketsMes.isr, bucketsMes.ebt);
  return {
    // La nota describe la tasa YTD, que es la que se muestra en la tarjeta.
    isr: {
      key: "isr",
      satRef: "SAT 206",
      mes: bucketsMes.isr,
      ytd: bucketsYtd.isr,
      sinProvision: Math.abs(bucketsMes.isr) <= IMPUESTO_TOL && Math.abs(bucketsYtd.isr) <= IMPUESTO_TOL,
    },
    ptu: {
      key: "ptu",
      satRef: "SAT 216",
      mes: bucketsMes.ptu,
      ytd: bucketsYtd.ptu,
      sinProvision: Math.abs(bucketsMes.ptu) <= IMPUESTO_TOL && Math.abs(bucketsYtd.ptu) <= IMPUESTO_TOL,
    },
    ebtMes: bucketsMes.ebt,
    ebtYtd: bucketsYtd.ebt,
    tasaEfectivaYtd: ytd.tasa,
    tasaEfectivaMes: mes.tasa,
    notaTasa: ytd.nota,
  };
}

export type PuenteClaseKey = "anticiposClientes" | "impuestosPorEnterar" | "funcionariosEmpleados";

const IMPUESTOS_NOMBRE_RE =
  /(ret\.|retenc|isr|imss|iva|ptu|infonavit|\bsar\b|nomina|imp\.|impuesto|enterar)/;

/** Clase puente de una cuenta de balance, o null si no es cuenta de riesgo. */
export function classifyPuenteCuenta(idCuenta: string, nombreCuenta: string): PuenteClaseKey | null {
  const segment = firstSegment(idCuenta);
  const nombre = normalizeText(nombreCuenta);
  if (segment.startsWith("2")) {
    if (segment.startsWith("2306") || nombre.includes("anticipo")) {
      return "anticiposClientes";
    }
    if (segment.startsWith("21") && IMPUESTOS_NOMBRE_RE.test(nombre)) {
      return "impuestosPorEnterar";
    }
    return null;
  }
  if (segment.startsWith("1107") || (segment.startsWith("11") && /(funcionario|empleado)/.test(nombre))) {
    return "funcionariosEmpleados";
  }
  return null;
}

export type Semaforo = "verde" | "ambar" | "rojo";
export type SemaforoClase = Semaforo | "sinCuentas";

export type PuenteMotivo = "saldoPresente" | "saldoCreciente" | "antiguedad60";

export type PuenteCuentaEstado = {
  idCuenta: string;
  nombreCuenta: string;
  /** saldoFinal con convención de balanza: deudor +, acreedor −. */
  saldo: number;
  saldoAnterior: number | null;
  /** Crecimiento del riesgo: |saldo| − |saldoAnterior|; null sin mes anterior. */
  variacionAbs: number | null;
  /** Días desde el último movimiento en auxiliares al cierre; null sin auxiliares. */
  antiguedadDias: number | null;
  semaforo: Semaforo;
  motivos: PuenteMotivo[];
};

export type PuenteClaseEstado = {
  key: PuenteClaseKey;
  existeEnCatalogo: boolean;
  semaforo: SemaforoClase;
  saldo: number;
  saldoAnterior: number | null;
  variacionAbs: number | null;
  cuentasConSaldo: number;
  /** Solo cuentas con |saldo| > tolerancia, ordenadas por |saldo| desc. */
  cuentas: PuenteCuentaEstado[];
};

const SEMAFORO_RANK: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2 };

export function semaforoCuenta(input: {
  saldo: number;
  saldoAnterior: number | null;
  antiguedadDias: number | null;
}): { semaforo: Semaforo; motivos: PuenteMotivo[] } {
  const { saldo, saldoAnterior, antiguedadDias } = input;
  if (Math.abs(saldo) <= PUENTE_SALDO_TOL) {
    return { semaforo: "verde", motivos: [] };
  }
  const motivos: PuenteMotivo[] = ["saldoPresente"];
  if (saldoAnterior != null && Math.abs(saldo) - Math.abs(saldoAnterior) > PUENTE_SALDO_TOL) {
    motivos.push("saldoCreciente");
  }
  if (antiguedadDias != null && antiguedadDias > PUENTE_ANTIGUEDAD_ROJA_DIAS) {
    motivos.push("antiguedad60");
    return { semaforo: "rojo", motivos };
  }
  return { semaforo: "ambar", motivos };
}

/** Último día del mes de corte (UTC), base del cálculo de antigüedad. */
export function corteDePeriodo(target: PeriodoRef): Date {
  return new Date(Date.UTC(target.anio, target.mes, 0));
}

export function antiguedadDiasDesde(ultimoMovimiento: Date, corte: Date): number {
  const diff = corte.getTime() - ultimoMovimiento.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/**
 * Health-check de cuentas puente del periodo. `rows` debe cubrir el mes de
 * corte y el mes anterior (saldoFinal); `auxUltimoMov` mapea idCuenta → fecha
 * ISO del último movimiento en auxiliares (puede no existir para una cuenta).
 */
export function evaluarCuentasPuente(input: {
  rows: RifBalanzaRow[];
  target: PeriodoRef;
  prior: PeriodoRef;
  auxUltimoMov: Record<string, string>;
}): PuenteClaseEstado[] {
  const { rows, target, prior, auxUltimoMov } = input;
  const corte = corteDePeriodo(target);
  const leafSet = selectLeafCodes([...new Set(rows.map((row) => row.idCuenta))]);

  const actualRows = rows.filter((row) => row.anio === target.anio && row.periodo === target.mes);
  const priorMap = new Map(
    rows
      .filter((row) => row.anio === prior.anio && row.periodo === prior.mes)
      .map((row) => [row.idCuenta, row.saldoFinal] as const),
  );

  const porClase = new Map<PuenteClaseKey, RifBalanzaRow[]>();
  for (const row of actualRows) {
    if (!leafSet.has(row.idCuenta)) continue;
    const clase = classifyPuenteCuenta(row.idCuenta, row.nombreCuenta);
    if (!clase) continue;
    const list = porClase.get(clase) ?? [];
    list.push(row);
    porClase.set(clase, list);
  }

  const clases: PuenteClaseKey[] = ["anticiposClientes", "impuestosPorEnterar", "funcionariosEmpleados"];
  return clases.map((key) => {
    const cuentasRows = porClase.get(key) ?? [];
    if (cuentasRows.length === 0) {
      return {
        key,
        existeEnCatalogo: false,
        semaforo: "sinCuentas",
        saldo: 0,
        saldoAnterior: null,
        variacionAbs: null,
        cuentasConSaldo: 0,
        cuentas: [],
      };
    }

    const cuentas: PuenteCuentaEstado[] = cuentasRows
      .map((row) => {
        const saldo = round2(row.saldoFinal);
        const saldoAnterior = priorMap.has(row.idCuenta) ? round2(priorMap.get(row.idCuenta)!) : null;
        const variacionAbs =
          saldoAnterior == null ? null : round2(Math.abs(saldo) - Math.abs(saldoAnterior));
        const ultimo = auxUltimoMov[row.idCuenta];
        const antiguedadDias = ultimo ? antiguedadDiasDesde(new Date(ultimo), corte) : null;
        const { semaforo, motivos } = semaforoCuenta({ saldo, saldoAnterior, antiguedadDias });
        return {
          idCuenta: row.idCuenta,
          nombreCuenta: row.nombreCuenta,
          saldo,
          saldoAnterior,
          variacionAbs,
          antiguedadDias,
          semaforo,
          motivos,
        };
      })
      .filter((cuenta) => Math.abs(cuenta.saldo) > PUENTE_SALDO_TOL)
      .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || a.idCuenta.localeCompare(b.idCuenta, "es"));

    const saldo = round2(cuentasRows.reduce((sum, row) => sum + row.saldoFinal, 0));
    const hasPrior = cuentasRows.some((row) => priorMap.has(row.idCuenta));
    const saldoAnterior = hasPrior
      ? round2(cuentasRows.reduce((sum, row) => sum + (priorMap.get(row.idCuenta) ?? 0), 0))
      : null;
    const semaforo = cuentas.reduce<Semaforo>(
      (worst, cuenta) => (SEMAFORO_RANK[cuenta.semaforo] > SEMAFORO_RANK[worst] ? cuenta.semaforo : worst),
      "verde",
    );

    return {
      key,
      existeEnCatalogo: true,
      semaforo,
      saldo,
      saldoAnterior,
      variacionAbs: saldoAnterior == null ? null : round2(Math.abs(saldo) - Math.abs(saldoAnterior)),
      cuentasConSaldo: cuentas.length,
      cuentas,
    };
  });
}
