/* Script temporal de auditoría: capital de trabajo desde balanza (jul-2026). */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

async function main() {
  const tenants = await pool.query(`SELECT id, name, rfc FROM tenants`);
  console.log("== TENANTS ==");
  for (const t of tenants.rows) console.log(t.id, "|", t.name, "|", t.rfc);

  const tenantId = tenants.rows.find((t: { name: string }) => /compac/i.test(t.name))?.id ?? tenants.rows[0]?.id;
  console.log("\nUsando tenant:", tenantId);

  const periodos = await pool.query(
    `SELECT DISTINCT anio, periodo FROM balanzas_pnl WHERE "tenantId" = $1 ORDER BY anio, periodo`,
    [tenantId],
  );
  console.log("\n== PERIODOS ==");
  console.log(periodos.rows.map((r: { anio: number; periodo: number }) => `${r.anio}-${String(r.periodo).padStart(2, "0")}`).join(" "));

  // Cuentas de la balanza en jul-2026 (anio 2026, periodo 7)
  const cuentas = await pool.query(
    `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra",
            "saldoInicial"::float AS si, debe::float AS debe, haber::float AS haber, "saldoFinal"::float AS sf
     FROM balanzas_pnl
     WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7
     ORDER BY "idCuenta"`,
    [tenantId],
  );
  console.log("\n== BALANZA 2026-07 (" + cuentas.rows.length + " cuentas) ==");
  for (const r of cuentas.rows) {
    console.log(
      `${r.idCuenta} | ${r.categoriaMaestra.padEnd(10)} | si=${r.si.toFixed(2).padStart(14)} | debe=${r.debe.toFixed(2).padStart(14)} | haber=${r.haber.toFixed(2).padStart(14)} | sf=${r.sf.toFixed(2).padStart(14)} | ${r.nombreCuenta}`,
    );
  }

  // Auxiliares del periodo
  const auxVentas = await pool.query(
    `SELECT count(*)::int AS n FROM auxiliares_ventas WHERE "tenantId" = $1`,
    [tenantId],
  );
  const auxEgresos = await pool.query(
    `SELECT count(*)::int AS n FROM auxiliares_egresos WHERE "tenantId" = $1`,
    [tenantId],
  );
  const auxMov = await pool.query(
    `SELECT count(*)::int AS n FROM auxiliar_movimientos WHERE "tenantId" = $1`,
    [tenantId],
  );
  console.log("\n== AUXILIARES (totales tenant) ==");
  console.log("auxiliares_ventas:", auxVentas.rows[0].n, "| auxiliares_egresos:", auxEgresos.rows[0].n, "| auxiliar_movimientos:", auxMov.rows[0].n);

  const users = await pool.query(`SELECT email, role, "cognitoSub", "tenantId" FROM users`);
  console.log("\n== USERS ==");
  for (const u of users.rows) console.log(u.email, "|", u.role, "|", u.cognitoSub, "|", u.tenantId);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const pasCierre = await pool.query(
    `SELECT "idCuenta" AS cuenta, "nombreCuenta" AS nombre, "saldoFinal"::float AS sf FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7 AND "categoriaMaestra" = 'Pasivo'`,
    [tenantId],
  );
  let deudaAntes = 0;
  console.log("\n== DEUDA BRUTA 'ANTES' (regex nombre prestamo|credito|deuda|bancari) ==");
  for (const r of pasCierre.rows) {
    if (/prestamo|credito|deuda|bancari/.test(norm(r.nombre))) {
      console.log(" ", r.cuenta, r.nombre, "sf:", r.sf);
      deudaAntes += Number(r.sf);
    }
  }
  console.log("deudaBruta ANTES:", deudaAntes.toFixed(2));

  const { structureFromBalanza, safeRatio } = await import("../src/services/metricsLedger");
  const { netWorkingCapital } = await import("../src/services/capitalTrabajoCalcs");
  const { buildPeriodSnapshot } = await import("../src/services/financialSnapshot");
  const { calculateLiquidez } = await import("../src/services/financialEngine");
  const { buildCapitalTrabajo } = await import("../src/services/modules/capitalTrabajo");
  const { COMPAC_ACCOUNT_ROLES } = await import("../src/services/ingest/builtinProfiles");
  const balJul = await pool.query(
    `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra", "saldoInicial"::float AS "saldoInicial",
            debe::float AS debe, haber::float AS haber, "saldoFinal"::float AS "saldoFinal",
            anio, periodo, 'MXN' AS moneda, 'tenant' AS "tenantId", 0 AS "esMayor"
     FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7`,
    [tenantId],
  );
  const estructura = structureFromBalanza(balJul.rows as never);
  const nwc = netWorkingCapital(estructura.activoCirculante, estructura.pasivoCirculante);
  console.log("\n== ESTRUCTURA jul-2026 (NWC) ==");
  console.log("activoCirculante:", estructura.activoCirculante.toFixed(2));
  console.log("pasivoCirculante:", estructura.pasivoCirculante.toFixed(2));
  console.log("NWC (antes, AC-PC firmado):", (estructura.activoCirculante - estructura.pasivoCirculante).toFixed(2));
  console.log("NWC (después, AC-|PC|):", nwc.toFixed(2));

  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: balJul.rows as never,
    tesoreria: [],
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });
  const liquidez = calculateLiquidez(snapshot);
  const modulo = buildCapitalTrabajo({
    ventasHastaCierre: [],
    egresosCorte: [],
    egresosHastaCierre: [],
    balanzaCierre: balJul.rows as never,
    balanzaMov: balJul.rows as never,
    accountRoles: COMPAC_ACCOUNT_ROLES,
    asOf: new Date("2026-07-31"),
  });
  console.log("snapshot.nwc:", snapshot.nwc.toFixed(2), "| modulo.nwc:", modulo.nwc.amount.toFixed(2));
  console.log(
    "cajaBancos:",
    snapshot.cajaBancos.toFixed(2),
    "| inventarios:",
    snapshot.inventarios.toFixed(2),
  );
  for (const key of ["currentRatio", "quickRatio", "cashRatio"] as const) {
    const m = liquidez.find((item) => item.key === key);
    console.log(`#${m?.id} ${key}:`, m?.value, m?.formatted);
  }
  console.log(
    "safeRatio AC/PC:",
    safeRatio(estructura.activoCirculante, estructura.pasivoCirculante),
    "| AC/|PC|:",
    safeRatio(estructura.activoCirculante, Math.abs(estructura.pasivoCirculante)),
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
