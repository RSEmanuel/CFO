/* Script temporal de auditoría: ROCE #10 / capitalEmpleado y #37 liabilityRatio (jul-2026). */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

async function main() {
  const tenants = await pool.query(`SELECT id, name FROM tenants`);
  const tenantId = tenants.rows.find((t: { name: string }) => /compac/i.test(t.name))?.id ?? tenants.rows[0]?.id;
  console.log("Usando tenant:", tenantId);

  // Réplica de resolveAccountRoles: perfil balanza con roles, TENANT gana, si no el primero.
  const profiles = await pool.query(
    `SELECT origin, "accountRoles" FROM ingest_mapping_profiles
     WHERE "documentType" = 'balanza' AND "accountRoles" IS NOT NULL AND "isActive" = true`,
  );
  const efectivo =
    profiles.rows.find((p: { origin: string }) => p.origin === "TENANT") ?? profiles.rows[0] ?? null;
  console.log("Perfil con roles:", efectivo ? efectivo.origin : "ninguno (DEFAULT)");

  const { DEFAULT_ACCOUNT_ROLES } = await import("../src/services/ingest/accountRoles");
  const roles = (efectivo?.accountRoles as never) ?? DEFAULT_ACCOUNT_ROLES;

  const balJul = await pool.query(
    `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra", "saldoInicial"::float AS "saldoInicial",
            debe::float AS debe, haber::float AS haber, "saldoFinal"::float AS "saldoFinal",
            anio, periodo, 'MXN' AS moneda, 'tenant' AS "tenantId", 0 AS "esMayor"
     FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7`,
    [tenantId],
  );

  const { buildPeriodSnapshot } = await import("../src/services/financialSnapshot");
  const { calculateRetorno, calculateSolvencia } = await import("../src/services/financialEngine");

  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: balJul.rows as never,
    tesoreria: [],
    accountRoles: roles,
  });

  const ceAntes = snapshot.activoTotal - snapshot.pasivoCirculante; // fórmula vieja (signo crudo)
  const ceDespues = snapshot.activoTotal - Math.abs(snapshot.pasivoCirculante);
  const roceAntes = (snapshot.ebit / ceAntes) * 100;
  const roceDespues = (snapshot.ebit / ceDespues) * 100;

  console.log("\n== ROCE #10 (jul-2026, roles efectivos del tenant) ==");
  console.log("ebit:", snapshot.ebit.toFixed(2));
  console.log("activoTotal:", snapshot.activoTotal.toFixed(2));
  console.log("pasivoCirculante (crudo):", snapshot.pasivoCirculante.toFixed(2));
  console.log("capitalEmpleado ANTES (A − PC firmado):", ceAntes.toFixed(2));
  console.log("capitalEmpleado DESPUES (A − |PC|):", ceDespues.toFixed(2));
  console.log("ROCE ANTES:", roceAntes.toFixed(2) + "%");
  console.log("ROCE DESPUES:", roceDespues.toFixed(2) + "%");
  const roce10 = calculateRetorno(snapshot, null).find((m) => m.key === "roce");
  console.log("ROCE catálogo #10 (código actual):", roce10?.value, roce10?.formatted);

  console.log("\n== #37 liabilityRatio (jul-2026) ==");
  console.log("pasivoTotal (crudo):", snapshot.pasivoTotal.toFixed(2));
  console.log("ANTES (PT/AT):", (snapshot.pasivoTotal / snapshot.activoTotal).toFixed(4));
  console.log("DESPUES (|PT|/AT):", (Math.abs(snapshot.pasivoTotal) / snapshot.activoTotal).toFixed(4));
  const liab37 = calculateSolvencia(snapshot, null).find((m) => m.key === "liabilityRatio");
  console.log("liabilityRatio catálogo #37 (código actual):", liab37?.value, liab37?.formatted);

  console.log("\n== Control: deudaBruta / endeudamiento ==");
  console.log("deudaBruta (rol, abs):", snapshot.deudaBruta.toFixed(2));
  console.log("deudaNeta:", snapshot.deudaNeta.toFixed(2), "| capitalInvertido:", snapshot.capitalInvertido.toFixed(2));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
