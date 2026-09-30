/* Script temporal de auditoría (PASO 0): verificación del déficit patrimonial jul-2026. */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

const n = (v: unknown) => Number(v ?? 0);
const f = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const tenants = await pool.query(`SELECT id, name FROM tenants`);
  const tenantId = tenants.rows.find((t: { name: string }) => /compac/i.test(t.name))?.id ?? tenants.rows[0]?.id;
  console.log("Tenant:", tenants.rows.find((t: { id: string }) => t.id === tenantId)?.name, `(${tenantId})`);

  const bal = await pool.query(
    `SELECT "idCuenta", "nombreCuenta", "categoriaMaestra", "saldoFinal"::float AS "saldoFinal",
            debe::float AS debe, haber::float AS haber
     FROM balanzas_pnl WHERE "tenantId" = $1 AND anio = 2026 AND periodo = 7
     ORDER BY "idCuenta"`,
    [tenantId],
  );
  const rows = bal.rows as Array<{ idCuenta: string; nombreCuenta: string; categoriaMaestra: string; saldoFinal: number; debe: number; haber: number }>;
  console.log(`\nFilas balanza jul-2026: ${rows.length}`);

  console.log("\n== Cuentas 3xxx (crudas, signo contable: acreedor = negativo) ==");
  const cap = rows.filter((r) => r.idCuenta.replace(/\D/g, "").startsWith("3"));
  for (const r of cap) {
    const naturaleza = r.saldoFinal < -0.005 ? "acreedor" : r.saldoFinal > 0.005 ? "DEUDOR" : "cero";
    console.log(`  ${r.idCuenta.padEnd(12)} ${r.nombreCuenta.slice(0, 45).padEnd(45)} ${f(r.saldoFinal).padStart(18)}  ${naturaleza}  [${r.categoriaMaestra}]`);
  }
  const sum3xxx = cap.reduce((acc, r) => acc + n(r.saldoFinal), 0);
  console.log(`  SUMA CRUDA 3xxx: ${f(sum3xxx)}`);

  console.log("\n== Resultado YTD (PyG: Ingreso/COGS/OpEx, saldoFinal) ==");
  const pyg = rows.filter((r) => ["Ingreso", "COGS", "OpEx"].includes(r.categoriaMaestra));
  const resultadoYtd = pyg.reduce((acc, r) => acc + n(r.saldoFinal), 0);
  console.log(`  Resultado YTD (signo capital: deudor + = pérdida): ${f(resultadoYtd)}`);

  console.log("\n== Totales de estructura ==");
  const sum = (cat: string) => rows.filter((r) => r.categoriaMaestra === cat).reduce((acc, r) => acc + n(r.saldoFinal), 0);
  const activo = sum("Activo");
  const pasivo = sum("Pasivo");
  console.log(`  Activo (A):            ${f(activo)}`);
  console.log(`  Pasivo (P, crudo):     ${f(pasivo)}`);
  console.log(`  Patrimonio (C, crudo): ${f(sum3xxx)}  ← structureFromBalanza.patrimonioNeto`);
  console.log(`  C + resultado YTD:     ${f(sum3xxx + resultadoYtd)}`);

  const capitalNif = -(sum3xxx + resultadoYtd);
  console.log(`\n== CAPITAL NIF ECONÓMICO = −(C crudo + resultado YTD) = ${f(capitalNif)} ==`);
  console.log(`  Identidad A = −(P + C): ${f(activo)} vs ${f(-(pasivo + sum3xxx + resultadoYtd))}`);
  console.log(`  Identidad A = |P| + C_económico: ${f(activo)} vs ${f(Math.abs(pasivo) + capitalNif)}`);
  console.log(`  Σ total balanza (debe cuadrar a 0 con PyG): ${f(activo + pasivo + sum3xxx + resultadoYtd)}`);

  console.log(`\n== VEREDICTO: ${capitalNif < -0.01 ? "DÉFICIT PATRIMONIAL CONFIRMADO" : "capital positivo (hipótesis refutada)"} ==`);
  console.log(`  Esperado por hipótesis: −10,572,461.03 | Obtenido: ${f(capitalNif)} | Δ = ${f(capitalNif - -10572461.03)}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
