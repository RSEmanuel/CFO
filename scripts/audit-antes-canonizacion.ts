/* Script temporal de auditoría: valores ANTES de la canonización (jul-2026). */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

async function main() {
  const tenants = await pool.query(`SELECT id, name FROM tenants`);
  const tenantId = tenants.rows.find((t: { name: string }) => /compac/i.test(t.name))?.id ?? tenants.rows[0]?.id;

  const profiles = await pool.query(
    `SELECT origin, "accountRoles" FROM ingest_mapping_profiles
     WHERE "documentType" = 'balanza' AND "accountRoles" IS NOT NULL AND "isActive" = true`,
  );
  const efectivo = profiles.rows.find((p: { origin: string }) => p.origin === "TENANT") ?? profiles.rows[0] ?? null;
  const { DEFAULT_ACCOUNT_ROLES } = await import("../src/services/ingest/accountRoles");
  const roles = (efectivo?.accountRoles as never) ?? DEFAULT_ACCOUNT_ROLES;

  const q = (anio: number, periodo: number) =>
    pool.query(
      `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra", "depreciacionAmortizacion",
              "saldoInicial"::float AS "saldoInicial", debe::float AS debe, haber::float AS haber,
              "saldoFinal"::float AS "saldoFinal", anio, periodo
       FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = $2 AND periodo = $3`,
      [tenantId, anio, periodo],
    );

  const balJul = (await q(2026, 7)).rows;
  const tesJul = await pool.query(
    `SELECT * FROM tesoreria_flujo WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7`,
    [tenantId],
  ).catch(() => ({ rows: [] }));

  const { buildPeriodSnapshot } = await import("../src/services/financialSnapshot");
  const { getAllMetrics } = await import("../src/services/financialEngine");
  const { buildEstadoOperativo } = await import("../src/services/estadoOperativo");
  const { money } = await import("../src/services/metricsLedger");

  const snapshot = buildPeriodSnapshot({
    anio: 2026, periodo: 7, balanza: balJul as never, tesoreria: tesJul.rows as never, accountRoles: roles,
  });

  console.log("== SNAPSHOT ACTUAL (catálogo, jul-2026) ==");
  console.log("ingresos:", snapshot.ingresos, "| cogs:", snapshot.cogs, "| opex:", snapshot.opex, "| da:", snapshot.da);
  console.log("ebit:", snapshot.ebit, "| ebitda:", snapshot.ebitda, "| utilidadBruta:", snapshot.utilidadBruta);
  console.log("gastosFinancieros:", snapshot.gastosFinancieros, "| impuestos:", snapshot.impuestos);
  console.log("ebt:", snapshot.ebt, "| utilidadNeta:", snapshot.utilidadNeta, "| taxRate:", snapshot.taxRate);
  console.log("nopat:", snapshot.nopat, "| patrimonio:", snapshot.patrimonio, "| activoTotal:", snapshot.activoTotal);
  console.log("capitalInvertido:", snapshot.capitalInvertido, "| pasivoTotal:", snapshot.pasivoTotal);

  const erRows = balJul.map((r: { idCuenta: string; nombreCuenta: string; debe: unknown; haber: unknown }) => ({
    idCuenta: r.idCuenta, nombreCuenta: r.nombreCuenta, debe: money(r.debe), haber: money(r.haber),
  }));
  const er = buildEstadoOperativo({ acumulado: erRows, mesActual: erRows, mesAnterior: [] });
  const pick = (k: string) => er.filas.find((f) => f.key === k)?.mesActual.monto;
  console.log("\n== ER OPERATIVO (mes jul-2026) ==");
  for (const k of ["ventas", "costo", "utilidadBruta", "totalOpex", "ebit", "daReintegro", "ebitda", "productosFinancieros", "gastosFinancieros", "rif", "ebt", "ptu", "isr", "utilidadNeta"]) {
    console.log(`  ${k}:`, pick(k));
  }

  const catalog = getAllMetrics(snapshot, null);
  console.log("\n== CATÁLOGO ACTUAL (50 métricas, jul-2026) ==");
  for (const cat of Object.values(catalog)) {
    for (const m of cat) {
      console.log(`  #${String(m.id).padStart(2)} ${m.key.padEnd(22)} ${String(m.value).padStart(12)} ${m.unit}`);
    }
  }

  const { buildDupont } = await import("../src/services/dupont");
  const dup = buildDupont({
    ventas: snapshot.ingresos, utilidadNeta: snapshot.utilidadNeta,
    activoTotal: snapshot.activoTotal, capitalContable: snapshot.patrimonio,
  });
  console.log("\n== DUPONT ACTUAL ==", JSON.stringify(dup));

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
