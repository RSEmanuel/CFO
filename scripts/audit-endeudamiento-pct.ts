/* Script temporal de auditoría: endeudamiento (signo) y porcentajes del catálogo (jul-2026).
   Uso: npx tsx scripts/audit-endeudamiento-pct.ts <salida.json> */
import { writeFileSync } from "node:fs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

async function balanzaDe(tenantId: string, anio: number, periodo: number) {
  const result = await pool.query(
    `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra", "saldoInicial"::float AS "saldoInicial",
            debe::float AS debe, haber::float AS haber, "saldoFinal"::float AS "saldoFinal",
            "depreciacionAmortizacion", anio, periodo
     FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = $2 AND periodo = $3`,
    [tenantId, anio, periodo],
  );
  return result.rows;
}

async function main() {
  const outPath = process.argv[2] ?? "audit-endeudamiento-pct.json";
  const tenants = await pool.query(`SELECT id, name FROM tenants`);
  const tenantId = tenants.rows.find((t: { name: string }) => /compac/i.test(t.name))?.id ?? tenants.rows[0]?.id;

  const profiles = await pool.query(
    `SELECT origin, "accountRoles" FROM ingest_mapping_profiles
     WHERE "documentType" = 'balanza' AND "accountRoles" IS NOT NULL AND "isActive" = true`,
  );
  const efectivo =
    profiles.rows.find((p: { origin: string }) => p.origin === "TENANT") ?? profiles.rows[0] ?? null;
  const { DEFAULT_ACCOUNT_ROLES } = await import("../src/services/ingest/accountRoles");
  const roles = (efectivo?.accountRoles as never) ?? DEFAULT_ACCOUNT_ROLES;

  const tesoreria = await pool.query(
    `SELECT "saldoInicialPeriodo"::float AS "saldoInicialPeriodo",
            "entradasOperativas"::float AS "entradasOperativas",
            "salidasOperativas"::float AS "salidasOperativas",
            "salidasCapex"::float AS "salidasCapex",
            "servicioDeuda"::float AS "servicioDeuda",
            "saldoFinalPeriodo"::float AS "saldoFinalPeriodo",
            anio, periodo
     FROM tesoreria_flujos WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7`,
    [tenantId],
  );

  const { buildPeriodSnapshot } = await import("../src/services/financialSnapshot");
  const { getAllMetrics } = await import("../src/services/financialEngine");
  const { structureFromBalanza, pnlFromBalanza, treasuryFromRows } = await import("../src/services/metricsLedger");
  const { buildSaludFinanciera } = await import("../src/services/modules/saludFinanciera");

  const balJul = await balanzaDe(tenantId, 2026, 7);
  const snapshot = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza: balJul as never,
    tesoreria: tesoreria.rows as never,
    accountRoles: roles,
  });

  let previous = null;
  const balJun = await balanzaDe(tenantId, 2026, 6);
  if (balJun.length > 0) {
    previous = buildPeriodSnapshot({
      anio: 2026,
      periodo: 6,
      balanza: balJun as never,
      tesoreria: [] as never,
      accountRoles: roles,
    });
  }

  const structure = structureFromBalanza(balJul as never, roles);
  const salud = buildSaludFinanciera(
    structure,
    pnlFromBalanza(balJul as never),
    treasuryFromRows(tesoreria.rows as never),
  );

  const catalog = getAllMetrics(snapshot, previous);
  const metrics = Object.values(catalog)
    .flat()
    .map((m) => ({ id: m.id, key: m.key, unit: m.unit, value: m.value, formatted: m.formatted }))
    .sort((a, b) => a.id - b.id);

  const out = {
    tenantId,
    pasivoTotalCrudo: structure.pasivoTotal,
    patrimonioNetoCrudo: structure.patrimonioNeto,
    endeudamiento: salud.endeudamientoTotal.value,
    metrics,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`tenant=${tenantId} métricas=${metrics.length} endeudamiento=${salud.endeudamientoTotal.value} → ${outPath}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
