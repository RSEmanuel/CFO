import assert from "node:assert/strict";
import test from "node:test";
import type { BalanzaPnL } from "@/generated/prisma/client";
import { buildEstadoOperativo, type ErCuentaRow } from "@/services/estadoOperativo";
import { buildPosicionTree, type StatementNode } from "@/services/posicionFinanciera";
import { round2 } from "@/services/money";

/**
 * Consistencia cruzada ER Operativo ≡ Árbol de Posición Financiera.
 *
 * Las dos vistas leen la misma balanza por rutas distintas:
 * - ER Operativo: SUMA de movimientos mensuales (debe/haber) ene→cierre,
 *   clasificada por prefijo 4xxx–8xxx. utilidadNeta > 0 = utilidad.
 * - Árbol (auditoría B3): "Resultado del ejercicio" = Σ saldoFinal de las
 *   cuentas PyG (categoriaMaestra Ingreso/COGS/OpEx) del periodo de cierre
 *   (`resultadoEjercicioYtd`, fuente única en metricsLedger), PRESENTADO con
 *   signo económico: POSITIVO = utilidad, NEGATIVO = pérdida.
 *
 * Convención de signos documentada: ER.utilidadNeta ≡ Árbol.resultadoYtd
 * (mismo signo económico; el crudo contable es el negado: acreedor = utilidad).
 *
 * La identidad solo se sostiene si la balanza sigue la convención CONTPAQi:
 * saldoFinal(m) = saldoInicial(m) + debe(m) − haber(m), saldoInicial(m+1) =
 * saldoFinal(m) y saldoInicial PyG de enero = 0 (cierre del ejercicio
 * anterior asentado). Este test la blinda con un dataset sintético que
 * cumple partida doble por mes y cuadre ΣsaldoFinal = 0 en el cierre.
 */

type BalanzaRowInput = Omit<Partial<BalanzaPnL>, "saldoInicial" | "debe" | "haber" | "saldoFinal"> & {
  idCuenta: string;
  saldoInicial?: number;
  debe?: number;
  haber?: number;
  saldoFinal?: number;
};

function balanzaRow(overrides: BalanzaRowInput): BalanzaPnL {
  return {
    nombreCuenta: overrides.idCuenta,
    categoriaMaestra: "Activo",
    saldoInicial: 0,
    debe: 0,
    haber: 0,
    saldoFinal: 0,
    depreciacionAmortizacion: false,
    ...overrides,
  } as unknown as BalanzaPnL;
}

const BANCOS = "1102-0001-0000-0000";
const PROVEEDORES = "2101-0001-0000-0000";
const CAPITAL = "3101-0001-0000-0000";
const VENTAS = "4101-0001-0000-0000";
const COSTO = "5101-0001-0000-0000";
const GASTOS = "6101-0001-0000-0000";
const FINANCIEROS = "8101-0001-0000-0000";

type MonthMovement = { ventas: number; costo: number; gastos: number; financieros: number };

/** Meses con utilidad: ene +350, feb +470, mar +150 → YTD mar = +970. */
const PROFIT_MONTHS: MonthMovement[] = [
  { ventas: 1000, costo: 400, gastos: 200, financieros: 50 },
  { ventas: 1200, costo: 500, gastos: 180, financieros: 50 },
  { ventas: 800, costo: 350, gastos: 250, financieros: 50 },
];

/** Un mes con pérdida: ventas 500, egresos 700 → YTD = −200 (deudor). */
const LOSS_MONTHS: MonthMovement[] = [{ ventas: 500, costo: 400, gastos: 250, financieros: 50 }];

/**
 * Construye la balanza mensual con la convención CONTPAQi: PyG arranca en
 * cero cada ejercicio y encadena YTD; balance encadenado; asientos del mes
 * cuadrados (cobro de ventas y pago de egresos contra bancos). El balance
 * arranca con Bancos 5000 = Proveedores 2000 + Capital 3000, así Σsf = 0
 * en todo cierre.
 */
function buildBalancedYear(movements: MonthMovement[]): BalanzaPnL[] {
  const rows: BalanzaPnL[] = [];
  const opening = new Map<string, number>([
    [BANCOS, 5000],
    [PROVEEDORES, -2000],
    [CAPITAL, -3000],
    [VENTAS, 0],
    [COSTO, 0],
    [GASTOS, 0],
    [FINANCIEROS, 0],
  ]);
  const categories: Record<string, BalanzaPnL["categoriaMaestra"]> = {
    [BANCOS]: "Activo",
    [PROVEEDORES]: "Pasivo",
    [CAPITAL]: "Patrimonio",
    [VENTAS]: "Ingreso",
    [COSTO]: "COGS",
    [GASTOS]: "OpEx",
    [FINANCIEROS]: "OpEx",
  };

  movements.forEach((movement, index) => {
    const periodo = index + 1;
    const egresos = movement.costo + movement.gastos + movement.financieros;
    const monthRows: Array<[string, number, number]> = [
      [BANCOS, movement.ventas, egresos],
      [PROVEEDORES, 0, 0],
      [CAPITAL, 0, 0],
      [VENTAS, 0, movement.ventas],
      [COSTO, movement.costo, 0],
      [GASTOS, movement.gastos, 0],
      [FINANCIEROS, movement.financieros, 0],
    ];
    const totalDebe = round2(monthRows.reduce((sum, [, debe]) => sum + debe, 0));
    const totalHaber = round2(monthRows.reduce((sum, [, , haber]) => sum + haber, 0));
    assert.equal(totalDebe, totalHaber, `partida doble rota en el mes ${periodo}`);

    for (const [idCuenta, debe, haber] of monthRows) {
      const saldoInicial = opening.get(idCuenta)!;
      const saldoFinal = round2(saldoInicial + debe - haber);
      rows.push(
        balanzaRow({
          idCuenta,
          categoriaMaestra: categories[idCuenta],
          saldoInicial,
          debe,
          haber,
          saldoFinal,
          periodo,
          anio: 2026,
        }),
      );
      opening.set(idCuenta, saldoFinal);
    }
  });
  return rows;
}

function findNode(nodes: StatementNode[], id: string): StatementNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = node.children ? findNode(node.children, id) : null;
    if (child) {
      return child;
    }
  }
  return null;
}

function erYtd(rows: BalanzaPnL[], cierre: number): number {
  const toEr = (row: BalanzaPnL): ErCuentaRow => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    debe: Number(row.debe),
    haber: Number(row.haber),
  });
  const estado = buildEstadoOperativo({
    acumulado: rows.filter((row) => row.periodo <= cierre).map(toEr),
    mesActual: rows.filter((row) => row.periodo === cierre).map(toEr),
    mesAnterior: rows.filter((row) => row.periodo === cierre - 1).map(toEr),
  });
  const utilidadNeta = estado.filas.find((fila) => fila.key === "utilidadNeta");
  return utilidadNeta?.acumulado.monto ?? 0;
}

function arbolResultadoYtd(rows: BalanzaPnL[], cierre: number): { resultado: number; control: number } {
  const tree = buildPosicionTree({ "2026": rows.filter((row) => row.periodo === cierre) }, ["2026"]);
  const resultado = findNode(tree, "epf:cap:resultado-ejercicio-ytd");
  const control = findNode(tree, "epf:control");
  assert.ok(resultado, "el árbol debe incluir la línea calculada de resultado del ejercicio");
  assert.ok(control, "el árbol debe cuadrar A = P + C (nodo de control presente)");
  return {
    resultado: resultado.values["2026"] ?? 0,
    control: control.values["2026"] ?? Number.NaN,
  };
}

test("consistencia cruzada con utilidad YTD: ER ≡ resultado del ejercicio del árbol (signo económico)", () => {
  const rows = buildBalancedYear(PROFIT_MONTHS);

  // La balanza de cierre cuadra: Σ saldoFinal = 0 (precondición del árbol).
  const cierre = PROFIT_MONTHS.length;
  const sumaSaldos = round2(
    rows.filter((row) => row.periodo === cierre).reduce((sum, row) => sum + Number(row.saldoFinal), 0),
  );
  assert.equal(sumaSaldos, 0);

  const ytd = erYtd(rows, cierre);
  assert.equal(ytd, 970, "ER YTD ene→mar = 350 + 470 + 150");

  const { resultado, control } = arbolResultadoYtd(rows, cierre);
  assert.equal(resultado, 970, "árbol: la utilidad se presenta positiva (signo económico)");
  assert.equal(ytd, round2(resultado), "ER.utilidadNeta ≡ Árbol.resultadoYtd");
  assert.equal(control, 0, "A = P + C cuadra al centavo con el resultado calculado");
});

test("consistencia cruzada con pérdida YTD: el árbol presenta la pérdida en negativo, como el ER", () => {
  const rows = buildBalancedYear(LOSS_MONTHS);
  const ytd = erYtd(rows, 1);
  assert.equal(ytd, -200, "ER YTD = pérdida de 200");

  const { resultado, control } = arbolResultadoYtd(rows, 1);
  assert.equal(resultado, -200, "árbol: pérdida presentada en negativo (signo económico)");
  assert.equal(ytd, round2(resultado));
  assert.equal(control, 0);
});

test("la identidad se sostiene en cualquier periodo de cierre intermedio", () => {
  const rows = buildBalancedYear(PROFIT_MONTHS);
  for (const cierre of [1, 2, 3]) {
    const ytd = erYtd(rows, cierre);
    const { resultado, control } = arbolResultadoYtd(rows, cierre);
    assert.equal(ytd, round2(resultado), `cierre ${cierre}: ER ≡ Árbol`);
    assert.equal(control, 0, `cierre ${cierre}: A = P + C`);
  }
});
