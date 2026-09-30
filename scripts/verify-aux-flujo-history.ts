import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";
import { round2, toNumber } from "../src/services/money";

/**
 * Verificación post-ingesta de auxiliares (06/07) y flujos (03) 2024-08 → 2026-06:
 *  1. Rowcount por periodo: auxiliar_movimientos, auxiliar_cuenta_resumen (por
 *     moneda), tesoreria_flujos/_detalle. Marca periodos con 0 filas inesperadas.
 *  2. Reconciliación auxiliar (MXN) vs balanza: Σ saldoFinal de subcuentas
 *     CLIENTE (1105/105) vs Σ balanza 1105*; PROVEEDOR (2101/201) vs −Σ balanza
 *     2101* (balanza acreedora se almacena en negativo). Diferencia material:
 *     >5% del saldo balanza o >$100K.
 *  3. Totales USD separados (la balanza está consolidada en MXN: no se mezclan).
 *  4. Ancla jul-2026 intacta.
 *
 * Uso: npx tsx scripts/verify-aux-flujo-history.ts
 */

const CLIENTE_SEGMENTS = new Set(["1105", "105"]);
const PROVEEDOR_SEGMENTS = new Set(["2101", "201"]);
const MATERIAL_PCT = 0.05;
const MATERIAL_ABS = 100_000;

function key(anio: number, periodo: number): string {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

function fmt(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function firstSegment(idCuenta: string): string {
  return idCuenta.split("-")[0] ?? idCuenta;
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");
  const tenantId = tenant.id;

  // ---------- 1: rowcounts ----------
  const [movGroup, resGroup, tesGroup, detGroup] = await Promise.all([
    prisma.auxiliarMovimiento.groupBy({
      by: ["anio", "periodo", "moneda"],
      where: { tenantId },
      _count: true,
    }),
    prisma.auxiliarCuentaResumen.groupBy({
      by: ["anio", "periodo", "moneda"],
      where: { tenantId },
      _count: true,
    }),
    prisma.tesoreriaFlujo.groupBy({ by: ["anio", "periodo"], where: { tenantId }, _count: true }),
    prisma.tesoreriaFlujoDetalle.groupBy({ by: ["anio", "periodo"], where: { tenantId }, _count: true }),
  ]);

  const periods: string[] = [];
  for (let anio = 2024; anio <= 2026; anio += 1) {
    for (let periodo = 1; periodo <= 12; periodo += 1) {
      if (anio === 2024 && periodo < 8) continue;
      if (anio === 2026 && periodo > 7) break;
      periods.push(key(anio, periodo));
    }
  }

  const mov = new Map(movGroup.map((g) => [`${key(g.anio, g.periodo)}|${g.moneda}`, g._count]));
  const res = new Map(resGroup.map((g) => [`${key(g.anio, g.periodo)}|${g.moneda}`, g._count]));
  const tes = new Map(tesGroup.map((g) => [key(g.anio, g.periodo), g._count]));
  const det = new Map(detGroup.map((g) => [key(g.anio, g.periodo), g._count]));

  console.log("== (1) ROWCOUNT POR PERIODO ==");
  const header = [
    "periodo".padEnd(9),
    "movMXN".padStart(8),
    "movUSD".padStart(8),
    "resMXN".padStart(8),
    "resUSD".padStart(8),
    "flujo".padStart(6),
    "detalle".padStart(8),
    "  notas",
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length + 12));
  const zeroFlags: string[] = [];
  for (const k of periods) {
    const movMxn = mov.get(`${k}|MXN`) ?? 0;
    const movUsd = mov.get(`${k}|USD`) ?? 0;
    const resMxn = res.get(`${k}|MXN`) ?? 0;
    const resUsd = res.get(`${k}|USD`) ?? 0;
    const flujo = tes.get(k) ?? 0;
    const detalle = det.get(k) ?? 0;
    const notes: string[] = [];
    const isJuly = k === "2026-07";
    if (movMxn === 0) notes.push(isJuly ? "movMXN=0 (jul: sin ingest 06)" : "¡movMXN=0!");
    if (movUsd === 0) notes.push(isJuly ? "movUSD=0 (jul: sin ingest 07)" : "¡movUSD=0!");
    if (resMxn === 0) notes.push("¡resMXN=0!");
    if (resUsd === 0) notes.push("¡resUSD=0!");
    if (flujo === 0) notes.push("¡flujo=0!");
    if (detalle === 0) notes.push("¡detalle=0!");
    if (notes.length > 0 && !isJuly) zeroFlags.push(`${k}: ${notes.join(", ")}`);
    console.log(
      [
        k.padEnd(9),
        String(movMxn).padStart(8),
        String(movUsd).padStart(8),
        String(resMxn).padStart(8),
        String(resUsd).padStart(8),
        String(flujo).padStart(6),
        String(detalle).padStart(8),
        notes.length ? `  ← ${notes.join(", ")}` : "",
      ].join(" "),
    );
  }

  // ---------- 2 + 3: reconciliación ----------
  console.log("\n== (2) RECONCILIACIÓN AUXILIAR MXN vs BALANZA · (3) TOTALES USD ==");
  const header2 = [
    "periodo".padEnd(9),
    "auxCli".padStart(15),
    "bal1105".padStart(15),
    "Δcli".padStart(12),
    "auxProv".padStart(15),
    "bal2101".padStart(15),
    "Δprov".padStart(12),
    "usdCli".padStart(12),
    "usdProv".padStart(12),
    "  notas",
  ].join(" ");
  console.log(header2);
  console.log("-".repeat(header2.length + 16));
  const materialDiffs: string[] = [];

  for (const k of periods) {
    const [anio, periodo] = k.split("-").map(Number) as [number, number];
    const [resumenMxn, resumenUsd, balanza] = await Promise.all([
      prisma.auxiliarCuentaResumen.findMany({
        where: { tenantId, anio, periodo, moneda: "MXN" },
        select: { idCuenta: true, saldoFinal: true },
      }),
      prisma.auxiliarCuentaResumen.findMany({
        where: { tenantId, anio, periodo, moneda: "USD" },
        select: { idCuenta: true, saldoFinal: true },
      }),
      prisma.balanzaPnL.findMany({
        where: { tenantId, anio, periodo },
        select: { idCuenta: true, saldoFinal: true },
      }),
    ]);
    const sumBy = <T extends { idCuenta: string; saldoFinal: Parameters<typeof toNumber>[0] }>(
      rows: T[],
      segments: Set<string>,
    ) =>
      round2(
        rows
          .filter((row) => segments.has(firstSegment(row.idCuenta)))
          .reduce((sum, row) => sum + toNumber(row.saldoFinal), 0),
      );
    const auxCli = sumBy(resumenMxn, CLIENTE_SEGMENTS);
    const auxProv = sumBy(resumenMxn, PROVEEDOR_SEGMENTS);
    const usdCli = sumBy(resumenUsd, CLIENTE_SEGMENTS);
    const usdProv = sumBy(resumenUsd, PROVEEDOR_SEGMENTS);
    // Balanza: 1105* deudor (+); 2101* acreedor se almacena en negativo.
    const bal1105 = round2(
      balanza
        .filter((row) => row.idCuenta.replace(/\D/g, "").startsWith("1105"))
        .reduce((sum, row) => sum + toNumber(row.saldoFinal), 0),
    );
    const bal2101 = round2(
      balanza
        .filter((row) => row.idCuenta.replace(/\D/g, "").startsWith("2101"))
        .reduce((sum, row) => sum + toNumber(row.saldoFinal), 0),
    );
    const diffCli = round2(auxCli - bal1105);
    const diffProv = round2(auxProv + bal2101);
    const notes: string[] = [];
    const material = (diff: number, base: number) =>
      Math.abs(diff) > MATERIAL_ABS || (Math.abs(base) > 0.01 && Math.abs(diff / base) > MATERIAL_PCT);
    if (material(diffCli, bal1105)) {
      notes.push("Δcli MATERIAL");
      materialDiffs.push(`${k} clientes: aux=${fmt(auxCli)} bal=${fmt(bal1105)} Δ=${fmt(diffCli)}`);
    }
    if (material(diffProv, bal2101)) {
      notes.push("Δprov MATERIAL");
      materialDiffs.push(`${k} proveedores: aux=${fmt(auxProv)} bal=${fmt(-bal2101)} Δ=${fmt(diffProv)}`);
    }
    console.log(
      [
        k.padEnd(9),
        fmt(auxCli).padStart(15),
        fmt(bal1105).padStart(15),
        fmt(diffCli).padStart(12),
        fmt(auxProv).padStart(15),
        fmt(-bal2101).padStart(15),
        fmt(diffProv).padStart(12),
        fmt(usdCli).padStart(12),
        fmt(usdProv).padStart(12),
        notes.length ? `  ← ${notes.join(", ")}` : "",
      ].join(" "),
    );
  }

  console.log("\n== RESUMEN EJECUTIVO ==");
  console.log(`  Periodos con filas 0 inesperadas: ${zeroFlags.length}`);
  for (const flag of zeroFlags) console.log(`    - ${flag}`);
  console.log(`  Diferencias MATERIALES (>5% o >$100K): ${materialDiffs.length}`);
  for (const diff of materialDiffs) console.log(`    - ${diff}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
