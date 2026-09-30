import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";
import { capitalContableNif, money, resultadoEjercicioYtd } from "../src/services/metricsLedger";
import { getEstadoOperativo } from "../src/services/estadoOperativoService";
import { round2 } from "../src/services/money";
import type { BalanzaPnL } from "../src/generated/prisma/client";

/**
 * Verificación post-ingesta de la historia real 2024-08 → 2026-07:
 *  1. Rowcount por periodo (24 cortes, ~606 cuentas).
 *  2. Partida doble por mes (Σ saldoFinal ≈ 0 y Σ debe = Σ haber).
 *  3. Cadena de saldos saldoFinal(m) = saldoInicial(m+1), separando balance
 *     (1xxx/2xxx/3xxx) de PyG (4xxx-8xxx, se reinicia en cierres de año).
 *  4. Ancla PyG: saldoFinal PyG jun-2026 ≡ saldoInicial PyG jul-2026 y
 *     ER YTD jul-2026 por la ruta del portal (Σ movimientos ene→jul).
 *  5. Capital contable NIF por mes (helper canónico capitalContableNif).
 *  6. Spot-check de clasificación: 1200/1202 deben ser Activo (contra-activo).
 *
 * Uso: npx tsx scripts/verify-real-history.ts
 */

const PYG_CATEGORIES = new Set(["Ingreso", "COGS", "OpEx"]);
const TOLERANCE = 0.01;

type PeriodKey = string;

function key(anio: number, periodo: number): PeriodKey {
  return `${anio}-${String(periodo).padStart(2, "0")}`;
}

function nextPeriod(anio: number, periodo: number): { anio: number; periodo: number } {
  return periodo === 12 ? { anio: anio + 1, periodo: 1 } : { anio, periodo: periodo + 1 };
}

function fmt(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error("No existe el tenant Compac.");
  const tenantId = tenant.id;

  const allRows = await prisma.balanzaPnL.findMany({
    where: { tenantId },
    orderBy: [{ anio: "asc" }, { periodo: "asc" }, { idCuenta: "asc" }],
  });
  const byPeriod = new Map<PeriodKey, BalanzaPnL[]>();
  for (const row of allRows) {
    const k = key(row.anio, row.periodo);
    const bucket = byPeriod.get(k) ?? [];
    bucket.push(row);
    byPeriod.set(k, bucket);
  }
  const periods = [...byPeriod.keys()].sort();
  console.log(`Periodos en DB: ${periods.length} (esperados 24: 2024-08 … 2026-07)`);

  // ---------- 1 + 2 + 5: tabla por periodo ----------
  console.log("\n== (1) ROWCOUNT · (2) PARTIDA DOBLE · (5) CAPITAL NIF ==");
  const header = [
    "periodo".padEnd(10),
    "cuentas".padStart(8),
    "ΣsaldoFinal".padStart(14),
    "Σdebe-Σhaber".padStart(14),
    "capitalNIF".padStart(16),
    "resultadoYtd(crudo)".padStart(20),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length + 4));
  const capitalSeries: Array<{ periodo: PeriodKey; capital: number }> = [];
  for (const k of periods) {
    const rows = byPeriod.get(k)!;
    const sumFinal = round2(rows.reduce((s, r) => s + money(r.saldoFinal), 0));
    const sumDebe = round2(rows.reduce((s, r) => s + money(r.debe), 0));
    const sumHaber = round2(rows.reduce((s, r) => s + money(r.haber), 0));
    const capital = capitalContableNif(rows);
    const ytd = resultadoEjercicioYtd(rows);
    capitalSeries.push({ periodo: k, capital });
    const flags: string[] = [];
    if (rows.length !== 606) flags.push("ROWCOUNT≠606");
    if (Math.abs(sumFinal) > TOLERANCE) flags.push("Σsf≠0");
    if (Math.abs(sumDebe - sumHaber) > TOLERANCE) flags.push("debe≠haber");
    console.log(
      [
        k.padEnd(10),
        String(rows.length).padStart(8),
        fmt(sumFinal).padStart(14),
        fmt(round2(sumDebe - sumHaber)).padStart(14),
        fmt(capital).padStart(16),
        fmt(ytd).padStart(20),
        flags.length ? `  ← ${flags.join(", ")}` : "",
      ].join(" "),
    );
  }

  // ---------- 3: cadena de saldos ----------
  console.log("\n== (3) CADENA DE SALDOS saldoFinal(m) → saldoInicial(m+1) ==");
  console.log(
    [
      "transición".padEnd(20),
      "balance Δ".padStart(16),
      "PyG Δ".padStart(16),
      "cuentas rotas (balance)".padEnd(24),
      "veredicto".padEnd(10),
    ].join(" "),
  );
  console.log("-".repeat(96));
  const chainBreaks: string[] = [];
  for (const k of periods) {
    const [anio, periodo] = k.split("-").map(Number) as [number, number];
    const next = nextPeriod(anio, periodo);
    const nextK = key(next.anio, next.periodo);
    const nextRows = byPeriod.get(nextK);
    if (!nextRows) continue;
    const rows = byPeriod.get(k)!;
    const nextByAccount = new Map(nextRows.map((r) => [r.idCuenta, r]));
    let balanceDelta = 0;
    let pygDelta = 0;
    const brokenAccounts: string[] = [];
    for (const row of rows) {
      const following = nextByAccount.get(row.idCuenta);
      if (!following) {
        brokenAccounts.push(`${row.idCuenta} (ausente en ${nextK})`);
        continue;
      }
      const delta = round2(money(row.saldoFinal) - money(following.saldoInicial));
      if (PYG_CATEGORIES.has(row.categoriaMaestra)) {
        pygDelta = round2(pygDelta + delta);
      } else {
        balanceDelta = round2(balanceDelta + delta);
        if (Math.abs(delta) > TOLERANCE) {
          brokenAccounts.push(`${row.idCuenta} Δ=${fmt(delta)}`);
        }
      }
    }
    const isYearClose = periodo === 12;
    // En cierre de año el PyG se reinicia a 0 (asiento de cierre CONTPAQi):
    // la ruptura PyG esperada = saldoFinal PyG de diciembre (el resultado del año).
    const pygOk = isYearClose ? true : Math.abs(pygDelta) <= TOLERANCE;
    const balanceOk = Math.abs(balanceDelta) <= TOLERANCE && brokenAccounts.length === 0;
    const verdict = balanceOk && pygOk ? "OK" : "RUPTURA";
    if (verdict !== "OK") {
      chainBreaks.push(`${k}→${nextK}: balanceΔ=${fmt(balanceDelta)} pygΔ=${fmt(pygDelta)} cuentas=${brokenAccounts.slice(0, 5).join("; ")}`);
    }
    console.log(
      [
        `${k} → ${nextK}`.padEnd(20),
        fmt(balanceDelta).padStart(16),
        fmt(pygDelta).padStart(16),
        (brokenAccounts.length === 0 ? "0" : `${brokenAccounts.length}`).padEnd(24),
        isYearClose ? `${verdict} (cierre año: PyG reinicia)` : verdict,
      ].join(" "),
    );
    for (const account of brokenAccounts) {
      console.log(`      cuenta balance con Δ: ${account}`);
    }
  }

  // ---------- 4: ancla PyG ----------
  console.log("\n== (4) ANCLA PyG ene→jun 2026 vs saldoInicial jul-2026 ==");
  const june = byPeriod.get("2026-06")!;
  const july = byPeriod.get("2026-07")!;
  const junePygFinal = round2(
    june.filter((r) => PYG_CATEGORIES.has(r.categoriaMaestra)).reduce((s, r) => s + money(r.saldoFinal), 0),
  );
  const julyPygInicial = round2(
    july.filter((r) => PYG_CATEGORIES.has(r.categoriaMaestra)).reduce((s, r) => s + money(r.saldoInicial), 0),
  );
  const ytdJanJunMovements = round2(
    periods
      .filter((k) => k >= "2026-01" && k <= "2026-06")
      .flatMap((k) => byPeriod.get(k)!)
      .filter((r) => PYG_CATEGORIES.has(r.categoriaMaestra))
      .reduce((s, r) => s + (money(r.debe) - money(r.haber)), 0),
  );
  const julyPygFinal = round2(
    july.filter((r) => PYG_CATEGORIES.has(r.categoriaMaestra)).reduce((s, r) => s + money(r.saldoFinal), 0),
  );
  const julyPygMovements = round2(
    july.filter((r) => PYG_CATEGORIES.has(r.categoriaMaestra)).reduce((s, r) => s + (money(r.debe) - money(r.haber)), 0),
  );
  console.log(`  saldoFinal PyG jun-2026 (crudo, deudor=+):      ${fmt(junePygFinal)}`);
  console.log(`  Σ movimientos PyG ene→jun 2026 (debe-haber):    ${fmt(ytdJanJunMovements)}`);
  console.log(`  saldoInicial PyG jul-2026 (crudo):              ${fmt(julyPygInicial)}  (esperado ≈ 2,422,031.62)`);
  console.log(`  movimientos PyG jul-2026 (debe-haber):          ${fmt(julyPygMovements)}`);
  console.log(`  saldoFinal PyG jul-2026 (crudo):                ${fmt(julyPygFinal)}`);
  console.log(`  identidad jul: si+mov = ${fmt(round2(julyPygInicial + julyPygMovements))} vs sf = ${fmt(julyPygFinal)}`);
  const anchorOk = Math.abs(junePygFinal - julyPygInicial) <= TOLERANCE;
  console.log(`  cadena jun→jul PyG: ${anchorOk ? "OK" : `RUPTURA Δ=${fmt(round2(junePygFinal - julyPygInicial))}`}`);

  // ER YTD jul-2026 por la ruta REAL del portal
  const er = await getEstadoOperativo(tenantId, "2026-07");
  const erYtdRow = er?.filas.find((row) => row.key === "utilidadNeta");
  const erYtd = erYtdRow?.acumulado?.monto ?? null;
  const erMes = erYtdRow?.mesActual?.monto ?? null;
  console.log(`\n  ER portal 2026-07 utilidadNeta: mesActual=${erMes != null ? fmt(erMes) : "N/D"}  YTD=${erYtd != null ? fmt(erYtd) : "N/D"}`);
  console.log(`  ER YTD certificado: -822,603.62 → ${erYtd != null && Math.abs(erYtd - -822603.62) <= TOLERANCE ? "INTACTO ✓" : `DIFIERE (Δ=${erYtd != null ? fmt(round2(erYtd - -822603.62)) : "N/D"})`}`);

  // ---------- 6: spot-check clasificación ----------
  console.log("\n== (6) SPOT-CHECK CLASIFICACIÓN 1200/1202 (deben ser Activo) ==");
  for (const k of ["2024-12", "2026-06"]) {
    const rows = byPeriod.get(k)!;
    const suspects = rows.filter((r) => {
      const first = r.idCuenta.replace(/\D/g, "").slice(0, 4);
      return first === "1200" || first === "1202";
    });
    const depAccounts = rows.filter(
      (r) => /depreciacion|amortizacion/i.test(r.nombreCuenta.normalize("NFD").replace(/[̀-ͯ]/g, "")),
    );
    console.log(`  ${k}: cuentas 1200/1202 → ${suspects.map((r) => `${r.idCuenta} "${r.nombreCuenta}" = ${r.categoriaMaestra}`).join(" | ") || "ninguna"}`);
    const misclassified = depAccounts.filter((r) => !PYG_CATEGORIES.has(r.categoriaMaestra) === false && r.categoriaMaestra === "OpEx" && !/^[4-8]/.test(r.idCuenta.replace(/\D/g, "").slice(0, 1)));
    const balanceDep = depAccounts.filter((r) => ["Activo", "Pasivo", "Patrimonio"].includes(r.categoriaMaestra));
    console.log(`       cuentas con "depreciacion/amortizacion" clasificadas como balance: ${balanceDep.map((r) => `${r.idCuenta}=${r.categoriaMaestra}`).join(" | ") || "ninguna"}`);
    if (misclassified.length > 0) {
      console.log(`       ¡MAL CLASIFICADAS!: ${misclassified.map((r) => r.idCuenta).join(", ")}`);
    }
  }

  console.log("\n== RESUMEN EJECUTIVO ==");
  console.log(`  Periodos: ${periods.length}/24`);
  console.log(`  Rupturas de cadena (balance): ${chainBreaks.length}`);
  for (const b of chainBreaks) console.log(`    - ${b}`);
  const negativeCapital = capitalSeries.filter((c) => c.capital < 0).length;
  console.log(`  Capital NIF negativo en ${negativeCapital}/${capitalSeries.length} meses`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
