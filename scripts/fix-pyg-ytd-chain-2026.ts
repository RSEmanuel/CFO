/**
 * Fix de data: ancla los movimientos PyG sintéticos ene→jun 2026 al acumulado
 * REAL que certifica la balanza CONTPAQi de jul-2026 (saldoInicial de julio =
 * acumulado del ejercicio al 30-jun), y restaura la cadena de saldos PyG 2026
 * con la convención del ancla real: saldoInicial(ene) = 0 (cierre 2025) y
 * saldoFinal(m) = saldoInicial(m) + debe(m) − haber(m) = saldoInicial(m+1).
 *
 * Causa raíz de la discrepancia ER vs Árbol: ene→jun 2026 en `balanzas_pnl`
 * son el output del seed (`seed-compac-history`, que cubre 2024-08→2026-06 con
 * saldoInicial PyG = 0 y saldoFinal = movimiento del mes), NO balanzas reales.
 * Sus movimientos PyG sumaban +9.21M de utilidad ficticia; la realidad
 * CONTPAQi (saldoInicial de la balanza real de julio + "02. Estado de
 * Resultados 31.07.26.xlsx", acumulado = −822,603.62) es pérdida acumulada de
 * 2.42M a junio. El ER Operativo suma movimientos (quedaba en +10.81M); el
 * Árbol usa saldoFinal(jul) real (−822.6K, correcto y necesario para A=P+C).
 *
 * Qué hace, por cuenta PyG (categoriaMaestra Ingreso/COGS/OpEx) y mes 1..6:
 *   1. Redistribuye el movimiento neto mensual para que Σ(ene..jun) sea
 *      EXACTAMENTE el saldoInicial real de julio de esa cuenta, preservando el
 *      perfil temporal del seed (pesos ∝ |movimiento|; uniforme si no hubo).
 *   2. Reescribe saldoInicial/saldoFinal encadenados (si(ene)=0).
 *   3. Mantiene partida doble por mes con contra-asiento en UNA cuenta puente
 *      de Patrimonio (la de mayor movimiento en el ancla jul-2026, inmutable,
 *      lo que hace la selección estable entre corridas).
 *   4. Re-deriva saldos de cuentas de balance 2026 hacia atrás desde el
 *      saldoInicial real de julio (solo cambia, de hecho, la cuenta puente).
 *
 * NO toca 2024/2025 ni 2026-07 (verificado con checksums antes/después).
 * Consecuencia conocida y aceptada: la cadena de saldos de la cuenta puente
 * entre dic-2025 (sintético, fuera de scope) y ene-2026 queda desplazada por
 * el contra-asiento acumulado; la cadena ene→jul 2026 queda exacta.
 *
 * Idempotente: si cada cuenta PyG ya acumula su saldoInicial de julio, la
 * cadena cierra y cada mes cuadra debe=haber, no escribe nada.
 *
 * Uso: npx tsx scripts/fix-pyg-ytd-chain-2026.ts
 * Nota: si se re-corre `seed:compac-history`, hay que re-correr este fix.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildEstadoOperativo, type ErCuentaRow } from "../src/services/estadoOperativo";
import { round2 } from "../src/services/money";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const PYG_CATEGORIES = new Set(["Ingreso", "COGS", "OpEx"]);
const FIX_YEAR = 2026;
const FIX_MONTHS = [1, 2, 3, 4, 5, 6] as const;
const ANCHOR_MONTH = 7;
const TOL = 0.01;

type Row = {
  idCuenta: string;
  nombreCuenta: string;
  categoriaMaestra: string;
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  montoPresupuestado: number;
  depreciacionAmortizacion: boolean;
  periodo: number;
  anio: number;
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function requireLocalConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Este fix solo puede ejecutarse contra una DB local; host recibido: ${url.hostname}.`);
  }
  return connectionString;
}

/** Resultado YTD ene→jul con la MISMA lógica del ER Operativo (movimientos). */
function resultadoYtdPorMovimientos(rows: Row[]): number {
  const erRows: ErCuentaRow[] = rows.map((row) => ({
    idCuenta: row.idCuenta,
    nombreCuenta: row.nombreCuenta,
    debe: row.debe,
    haber: row.haber,
  }));
  const estado = buildEstadoOperativo({ acumulado: erRows, mesActual: [], mesAnterior: [] });
  return estado.filas.find((fila) => fila.key === "utilidadNeta")?.acumulado.monto ?? 0;
}

/** Resultado del ejercicio con la MISMA fuente del Árbol: Σ saldoFinal PyG del cierre. */
function resultadoEjercicioArbol(rows: Row[]): number {
  return round2(
    rows
      .filter((row) => row.periodo === ANCHOR_MONTH && PYG_CATEGORIES.has(row.categoriaMaestra))
      .reduce((sum, row) => sum + row.saldoFinal, 0),
  );
}

function checksum(rows: Row[]): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.anio}-${String(row.periodo).padStart(2, "0")}`;
    totals.set(
      key,
      round2((totals.get(key) ?? 0) + row.saldoInicial + row.debe * 1e6 + row.haber * 1e12 + row.saldoFinal * 1e18),
    );
  }
  return [...totals.entries()].sort().map(([key, value]) => `${key}:${value}`).join("|");
}

async function main(): Promise<void> {
  const connectionString = requireLocalConnectionString();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 0, keepAlive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
    if (!tenant) {
      throw new Error(`No existe el tenant Compac con RFC ${EMPTY_COMPAC_TENANT.rfc}.`);
    }
    console.log(`tenant=${tenant.id} (${tenant.name})`);

    const dbRows = await prisma.balanzaPnL.findMany({
      where: { tenantId: tenant.id, anio: FIX_YEAR },
      orderBy: [{ periodo: "asc" }, { idCuenta: "asc" }],
    });
    const rows: Row[] = dbRows.map((row) => ({
      idCuenta: row.idCuenta,
      nombreCuenta: row.nombreCuenta,
      categoriaMaestra: row.categoriaMaestra,
      saldoInicial: Number(row.saldoInicial),
      debe: Number(row.debe),
      haber: Number(row.haber),
      saldoFinal: Number(row.saldoFinal),
      montoPresupuestado: Number(row.montoPresupuestado),
      depreciacionAmortizacion: row.depreciacionAmortizacion,
      periodo: row.periodo,
      anio: row.anio,
    }));
    const anchorRows = rows.filter((row) => row.periodo === ANCHOR_MONTH);
    if (anchorRows.length === 0) {
      throw new Error("No hay balanza 2026-07 (ancla real). Carga el archivo 05 primero.");
    }

    // Checksums de lo INTOCABLE: 2024/2025 completos y 2026-07.
    const protectedRows = await prisma.balanzaPnL.findMany({
      where: { tenantId: tenant.id, OR: [{ anio: { lt: FIX_YEAR } }, { anio: FIX_YEAR, periodo: ANCHOR_MONTH }] },
      select: { anio: true, periodo: true, saldoInicial: true, debe: true, haber: true, saldoFinal: true },
    });
    const protectedBefore = checksum(
      protectedRows.map((row) => ({
        idCuenta: "",
        nombreCuenta: "",
        categoriaMaestra: "",
        saldoInicial: Number(row.saldoInicial),
        debe: Number(row.debe),
        haber: Number(row.haber),
        saldoFinal: Number(row.saldoFinal),
        montoPresupuestado: 0,
        depreciacionAmortizacion: false,
        periodo: row.periodo,
        anio: row.anio,
      })),
    );

    const ytdAntes = resultadoYtdPorMovimientos(rows);
    const arbolAntes = resultadoEjercicioArbol(rows);
    console.log("\n== ANTES ==");
    console.log(`ER Operativo YTD ene→jul (Σ movimientos):      ${fmt(ytdAntes)}`);
    console.log(`Árbol "Resultado del ejercicio" (Σ sf PyG jul): ${fmt(arbolAntes)}  (deudor + = pérdida)`);
    console.log(`Brecha: ${fmt(round2(ytdAntes + arbolAntes))}`);

    // Cuenta puente: Patrimonio con mayor movimiento en el ancla (inmutable => idempotente).
    const bridge = anchorRows
      .filter((row) => row.categoriaMaestra === "Patrimonio")
      .sort((a, b) => b.debe + b.haber - (a.debe + a.haber) || a.idCuenta.localeCompare(b.idCuenta))[0];
    if (!bridge) {
      throw new Error("No hay cuenta de Patrimonio en el ancla para usar como puente.");
    }
    console.log(`cuentaPuente=${bridge.idCuenta} (${bridge.nombreCuenta})`);

    const byKey = new Map<string, Row>();
    for (const row of rows) {
      byKey.set(`${row.periodo}|${row.idCuenta}`, row);
    }
    const rowAt = (periodo: number, idCuenta: string): Row => {
      const row = byKey.get(`${periodo}|${idCuenta}`);
      if (!row) {
        throw new Error(`Falta la cuenta ${idCuenta} en 2026-${String(periodo).padStart(2, "0")}.`);
      }
      return row;
    };

    const anchorSi = new Map(anchorRows.map((row) => [row.idCuenta, row.saldoInicial]));
    const pygIds = anchorRows.filter((row) => PYG_CATEGORIES.has(row.categoriaMaestra)).map((row) => row.idCuenta);
    const balanceIds = anchorRows.filter((row) => !PYG_CATEGORIES.has(row.categoriaMaestra)).map((row) => row.idCuenta);

    // Estado de trabajo: copia mutable de los meses 1..6.
    const work = new Map<string, Row>();
    for (const periodo of FIX_MONTHS) {
      for (const id of [...pygIds, ...balanceIds]) {
        work.set(`${periodo}|${id}`, { ...rowAt(periodo, id) });
      }
    }
    const wrow = (periodo: number, id: string): Row => work.get(`${periodo}|${id}`)!;

    // ¿Ya está aplicado? (idempotencia)
    const alreadyApplied =
      pygIds.every((id) => {
        const target = anchorSi.get(id)!;
        const sum = round2(FIX_MONTHS.reduce((acc, m) => acc + (wrow(m, id).debe - wrow(m, id).haber), 0));
        const chainOk =
          Math.abs(wrow(1, id).saldoInicial) <= TOL &&
          FIX_MONTHS.every((m) => {
            const current = wrow(m, id);
            if (Math.abs(current.saldoFinal - round2(current.saldoInicial + current.debe - current.haber)) > TOL) {
              return false;
            }
            return m === ANCHOR_MONTH - 1
              ? Math.abs(current.saldoFinal - target) <= TOL
              : Math.abs(current.saldoFinal - wrow(m + 1, id).saldoInicial) <= TOL;
          });
        return Math.abs(sum - target) <= TOL && chainOk;
      }) &&
      FIX_MONTHS.every((m) => {
        const debe = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).debe, 0));
        const haber = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).haber, 0));
        return Math.abs(debe - haber) <= TOL;
      });

    if (alreadyApplied) {
      console.log("\nLa data 2026 ya acumula al ancla real y cuadra: nada que hacer (idempotente).");
      return;
    }

    // 1) Redistribuir movimientos PyG ene→jun al acumulado real (= saldoInicial de julio).
    const movAntesPorMes = new Map<number, number>();
    for (const m of FIX_MONTHS) {
      movAntesPorMes.set(m, round2(pygIds.reduce((acc, id) => acc + (wrow(m, id).haber - wrow(m, id).debe), 0)));
    }
    for (const id of pygIds) {
      const target = anchorSi.get(id)!; // acumulado real ene→jun, firmado deudor(+)/acreedor(−)
      const months = FIX_MONTHS.map((m) => wrow(m, id));
      const current = months.map((row) => round2(row.debe - row.haber));
      const sumCurrent = round2(current.reduce((acc, value) => acc + value, 0));
      if (Math.abs(sumCurrent - target) <= TOL) {
        continue; // la cuenta ya acumula lo correcto; solo se re-encadenan saldos abajo
      }
      const weights = current.map((value) => Math.abs(value));
      const totalWeight = weights.reduce((acc, value) => acc + value, 0);
      const share = totalWeight > 0 ? weights.map((value) => value / totalWeight) : months.map(() => 1 / months.length);
      let assigned = 0;
      months.forEach((row, index) => {
        const movement =
          index < months.length - 1 ? round2(target * share[index]!) : round2(target - assigned);
        assigned = round2(assigned + movement);
        row.debe = movement >= 0 ? movement : 0;
        row.haber = movement >= 0 ? 0 : round2(-movement);
      });
    }

    // 2) Partida doble por mes: contra-asiento en la cuenta puente de Patrimonio.
    for (const m of FIX_MONTHS) {
      const debe = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).debe, 0));
      const haber = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).haber, 0));
      const delta = round2(debe - haber);
      if (Math.abs(delta) <= TOL) {
        continue;
      }
      const bridgeRow = wrow(m, bridge.idCuenta);
      if (delta > 0) {
        bridgeRow.haber = round2(bridgeRow.haber + delta);
      } else {
        bridgeRow.debe = round2(bridgeRow.debe + Math.abs(delta));
      }
    }

    // 3) Cadena PyG 2026: si(ene)=0 (cierre 2025), sf(m)=si(m)+debe−haber=si(m+1).
    for (const id of pygIds) {
      let opening = 0;
      for (const m of FIX_MONTHS) {
        const row = wrow(m, id);
        row.saldoInicial = opening;
        row.saldoFinal = round2(opening + row.debe - row.haber);
        opening = row.saldoFinal;
      }
      const anchor = anchorSi.get(id)!;
      if (Math.abs(opening - anchor) > TOL) {
        throw new Error(`La cuenta ${id} acumula ${opening} pero el ancla jul-2026 dice ${anchor}.`);
      }
    }

    // 4) Saldos de balance 2026 hacia atrás desde el saldoInicial real de julio.
    for (const id of balanceIds) {
      let nextOpening = anchorSi.get(id)!;
      for (const m of [...FIX_MONTHS].reverse()) {
        const row = wrow(m, id);
        row.saldoFinal = nextOpening;
        row.saldoInicial = round2(nextOpening - row.debe + row.haber);
        nextOpening = row.saldoInicial;
      }
    }

    // Verificaciones en memoria ANTES de escribir.
    for (const m of FIX_MONTHS) {
      const debe = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).debe, 0));
      const haber = round2([...pygIds, ...balanceIds].reduce((acc, id) => acc + wrow(m, id).haber, 0));
      if (Math.abs(debe - haber) > TOL) {
        throw new Error(`Partida doble rota en 2026-${String(m).padStart(2, "0")}: debe=${debe} haber=${haber}.`);
      }
      for (const id of [...pygIds, ...balanceIds]) {
        const row = wrow(m, id);
        if (Math.abs(row.saldoFinal - round2(row.saldoInicial + row.debe - row.haber)) > TOL) {
          throw new Error(`Identidad sf=si+debe−haber rota en ${id} periodo ${m}.`);
        }
        const nextSi = m === ANCHOR_MONTH - 1 ? anchorSi.get(id)! : wrow(m + 1, id).saldoInicial;
        if (Math.abs(row.saldoFinal - nextSi) > TOL) {
          throw new Error(`Cadena rota en ${id}: sf(${m})=${row.saldoFinal} si(${m + 1})=${nextSi}.`);
        }
      }
    }

    const rowsAfter = rows.map((row) =>
      row.periodo === ANCHOR_MONTH ? row : (work.get(`${row.periodo}|${row.idCuenta}`) ?? row),
    );
    const ytdDespues = resultadoYtdPorMovimientos(rowsAfter);
    const arbolDespues = resultadoEjercicioArbol(rowsAfter);

    console.log("\n== DESPUÉS (simulado en memoria) ==");
    console.log(`ER Operativo YTD ene→jul (Σ movimientos):      ${fmt(ytdDespues)}`);
    console.log(`Árbol "Resultado del ejercicio" (Σ sf PyG jul): ${fmt(arbolDespues)}  (deudor + = pérdida)`);
    console.log(`Consistencia cruzada (ER ≡ −Árbol): ${fmt(ytdDespues)} vs ${fmt(-arbolDespues)}`);
    if (Math.abs(ytdDespues + arbolDespues) > TOL) {
      throw new Error("La consistencia cruzada no cierra tras el fix.");
    }
    console.log("\nResultado PyG por mes (utilidad + / pérdida −), antes → después:");
    for (const m of FIX_MONTHS) {
      const despues = round2(pygIds.reduce((acc, id) => acc + (wrow(m, id).haber - wrow(m, id).debe), 0));
      console.log(`  2026-${String(m).padStart(2, "0")}: ${fmt(movAntesPorMes.get(m)!)}  →  ${fmt(despues)}`);
    }
    const julMov = round2(pygIds.reduce((acc, id) => acc + (rowAt(ANCHOR_MONTH, id).haber - rowAt(ANCHOR_MONTH, id).debe), 0));
    console.log(`  2026-07 (real, intacto): ${fmt(julMov)}`);

    // Persistir: reemplazo transaccional de 2026 periodos 1..6 únicamente.
    const newRows = FIX_MONTHS.flatMap((m) => [...pygIds, ...balanceIds].map((id) => wrow(m, id)));
    await prisma.$transaction(
      async (tx) => {
        await tx.balanzaPnL.deleteMany({
          where: { tenantId: tenant.id, anio: FIX_YEAR, periodo: { in: [...FIX_MONTHS] } },
        });
        await tx.balanzaPnL.createMany({
          data: newRows.map((row) => ({
            tenantId: tenant.id,
            idCuenta: row.idCuenta,
            nombreCuenta: row.nombreCuenta,
            categoriaMaestra: row.categoriaMaestra as never,
            saldoInicial: row.saldoInicial,
            debe: row.debe,
            haber: row.haber,
            saldoFinal: row.saldoFinal,
            montoPresupuestado: row.montoPresupuestado,
            depreciacionAmortizacion: row.depreciacionAmortizacion,
            periodo: row.periodo,
            anio: row.anio,
          })),
        });
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    // Verificación post-escritura: lo intocable sigue intacto.
    const protectedAfterRows = await prisma.balanzaPnL.findMany({
      where: { tenantId: tenant.id, OR: [{ anio: { lt: FIX_YEAR } }, { anio: FIX_YEAR, periodo: ANCHOR_MONTH }] },
      select: { anio: true, periodo: true, saldoInicial: true, debe: true, haber: true, saldoFinal: true },
    });
    const protectedAfter = checksum(
      protectedAfterRows.map((row) => ({
        idCuenta: "",
        nombreCuenta: "",
        categoriaMaestra: "",
        saldoInicial: Number(row.saldoInicial),
        debe: Number(row.debe),
        haber: Number(row.haber),
        saldoFinal: Number(row.saldoFinal),
        montoPresupuestado: 0,
        depreciacionAmortizacion: false,
        periodo: row.periodo,
        anio: row.anio,
      })),
    );
    if (protectedBefore !== protectedAfter) {
      throw new Error("Se modificó data protegida (2024/2025 o 2026-07). Revisa la transacción.");
    }
    console.log("\nEscrito. 2024/2025 y 2026-07 intactos (checksum verificado).");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
