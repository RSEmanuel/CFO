/* Auditoría ANTES/DESPUÉS de la canonización (jul-2026, DB real).
 * ANTES = aritmética vieja del snapshot reconstruida sobre pnlFromBalanza
 * (se mantiene intacta en metricsLedger) + patrimonio crudo 3xxx.
 * DESPUÉS = buildPeriodSnapshot actual (ER canónico + capital NIF).
 */
import { Pool } from "pg";
import { getAllMetrics, type CatalogMetric } from "../src/services/financialEngine";
import { buildPeriodSnapshot, type PeriodSnapshot } from "../src/services/financialSnapshot";
import { buildDupont } from "../src/services/dupont";
import { buildSaludFinanciera } from "../src/services/modules/saludFinanciera";
import {
  isCashAccount,
  isDividendAccount,
  isIncomeTaxAccount,
  isInventoryAccount,
  money,
  pnlFromBalanza,
  structureFromBalanza,
  treasuryFromRows,
} from "../src/services/metricsLedger";
import {
  cccFromBalanza,
  deudaFinancieraFromBalanza,
  deudaFinancieraPorNombre,
  netWorkingCapital,
} from "../src/services/capitalTrabajoCalcs";
import { COMPAC_ACCOUNT_ROLES } from "../src/services/ingest/builtinProfiles";
import { round2 } from "../src/services/money";
import type { BalanzaPnL } from "../src/generated/prisma/client";

const pool = new Pool({
  connectionString: "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
  max: 2,
});

/** Réplica exacta del buildPeriodSnapshot ANTES de la canonización. */
function snapshotAntes(rows: BalanzaPnL[], tesoreria: Parameters<typeof treasuryFromRows>[0]): PeriodSnapshot {
  const pnl = pnlFromBalanza(rows);
  const structure = structureFromBalanza(rows, COMPAC_ACCOUNT_ROLES);
  const treasury = treasuryFromRows(tesoreria);

  const gastosFinancieros = pnl.gastosFinancierosPnl > 0.01 ? pnl.gastosFinancierosPnl : treasury.servicioDeuda;
  const impuestos = round2(
    rows
      .filter((fila) => isIncomeTaxAccount(fila.nombreCuenta) && fila.categoriaMaestra === "OpEx")
      .reduce((acc, fila) => acc + (money(fila.debe) - money(fila.haber)), 0),
  );
  const ebt = round2(pnl.ebit - gastosFinancieros);
  const utilidadNeta = round2(ebt - impuestos);
  const taxRate = ebt > 0.01 && impuestos > 0.01 ? round2(impuestos / ebt) : 0.3;
  const nopat = round2(pnl.ebit * (1 - taxRate));
  const ocfFromOps = round2(treasury.entradasOperativas - treasury.salidasOperativas);
  const ocf = Math.abs(ocfFromOps) > 0.01 ? ocfFromOps : round2(treasury.freeCashFlow + treasury.salidasCapex);
  const sga = round2(Math.max(pnl.opex - pnl.da, 0));

  const activoTotal = round2(
    rows.filter((f) => f.categoriaMaestra === "Activo").reduce((acc, f) => acc + money(f.saldoFinal), 0),
  );
  const cajaBancos = round2(
    rows
      .filter((f) => f.categoriaMaestra === "Activo" && isCashAccount(f.idCuenta, f.nombreCuenta))
      .reduce((acc, f) => acc + money(f.saldoFinal), 0),
  );
  const deudaPorRol = deudaFinancieraFromBalanza(rows, COMPAC_ACCOUNT_ROLES);
  const deudaBruta = deudaPorRol ?? deudaFinancieraPorNombre(rows);
  const deudaNeta = round2(deudaBruta - cajaBancos);
  const capitalInvertido = round2(structure.patrimonioNeto + Math.max(deudaNeta, 0));
  const inventarioInicial = round2(
    rows
      .filter((f) => f.categoriaMaestra === "Activo" && isInventoryAccount(f.idCuenta, f.nombreCuenta))
      .reduce((acc, f) => acc + money(f.saldoInicial), 0),
  );
  const inventarioPromedio = round2((inventarioInicial + structure.inventarios) / 2);
  const dividendos = round2(
    rows.filter((f) => isDividendAccount(f.nombreCuenta)).reduce((acc, f) => acc + (money(f.debe) - money(f.haber)), 0),
  );
  const ccc = cccFromBalanza({ balanzaCierre: rows, balanzaMov: rows, roles: COMPAC_ACCOUNT_ROLES });
  const ke = round2(0.08 + 1 * 0.06);
  const kd = deudaBruta > 0.01 ? round2(gastosFinancieros / deudaBruta) : 0;
  const equity = Math.max(structure.patrimonioNeto, 0);
  const debtForWacc = Math.max(deudaBruta, 0);
  const firm = equity + debtForWacc;
  const wacc = firm > 0.01 ? round2(ke * (equity / firm) + kd * (1 - taxRate) * (debtForWacc / firm)) : ke;

  return {
    anio: 2026,
    periodo: 7,
    ingresos: pnl.ingresos,
    cogs: pnl.cogs,
    opex: pnl.opex,
    da: pnl.da,
    sga,
    ebit: pnl.ebit,
    ebitda: pnl.ebitda,
    utilidadBruta: pnl.utilidadBruta,
    gastosFinancieros,
    impuestos,
    ebt,
    utilidadNeta,
    taxRate,
    nopat,
    ocf,
    fcf: treasury.freeCashFlow,
    capex: treasury.salidasCapex,
    saldoCaja: treasury.saldoFinal > 0.01 ? treasury.saldoFinal : cajaBancos,
    salidasOperativas: treasury.salidasOperativas,
    activoTotal,
    activoCirculante: structure.activoCirculante,
    pasivoCirculante: structure.pasivoCirculante,
    pasivoTotal: structure.pasivoTotal,
    patrimonio: structure.patrimonioNeto,
    inventarios: structure.inventarios,
    inventarioPromedio: inventarioPromedio > 0.01 ? inventarioPromedio : structure.inventarios,
    cajaBancos,
    cxc: ccc.cxcPromedio,
    cxp: ccc.cxpPromedio,
    deudaBruta,
    deudaNeta,
    capitalInvertido,
    nwc: netWorkingCapital(structure.activoCirculante, structure.pasivoCirculante),
    dividendos,
    dso: ccc.dso,
    dio: ccc.dio,
    dpo: ccc.dpo,
    ccc: ccc.days,
    ke,
    kd,
    wacc,
  };
}

function flatten(categories: ReturnType<typeof getAllMetrics>): CatalogMetric[] {
  return [
    ...categories.margenes,
    ...categories.retorno,
    ...categories.eficiencia,
    ...categories.liquidez,
    ...categories.solvencia,
    ...categories.gestion,
  ];
}

async function main() {
  const balanza = (
    await pool.query(
      `SELECT * FROM balanzas_pnl WHERE anio = 2026 AND periodo = 7 ORDER BY "idCuenta"`,
    )
  ).rows as unknown as BalanzaPnL[];
  const tesoreria = (
    await pool.query(`SELECT * FROM tesoreria_flujos WHERE anio = 2026 AND periodo = 7`)
  ).rows as unknown as Parameters<typeof treasuryFromRows>[0];

  const antes = snapshotAntes(balanza, tesoreria);
  const despues = buildPeriodSnapshot({
    anio: 2026,
    periodo: 7,
    balanza,
    tesoreria,
    accountRoles: COMPAC_ACCOUNT_ROLES,
  });

  console.log("== SNAPSHOT: ANTES → DESPUÉS ==");
  const campos: Array<keyof PeriodSnapshot> = [
    "ingresos", "cogs", "opex", "da", "sga", "ebit", "ebitda", "utilidadBruta",
    "gastosFinancieros", "impuestos", "ebt", "utilidadNeta", "taxRate", "nopat",
    "patrimonio", "capitalInvertido", "wacc", "kd",
  ];
  for (const campo of campos) {
    const a = antes[campo];
    const d = despues[campo];
    const marca = a !== d ? "  ← CAMBIA" : "";
    console.log(`  ${campo}: ${a} → ${d}${marca}`);
  }

  const catAntes = new Map(flatten(getAllMetrics(antes, null)).map((m) => [m.key, m]));
  const catDespues = flatten(getAllMetrics(despues, null));
  console.log("\n== CATÁLOGO 50: ANTES → DESPUÉS (solo cambios) ==");
  for (const m of catDespues) {
    const a = catAntes.get(m.key);
    const antesVal = a?.value ?? null;
    if (antesVal !== m.value || (m.nullReason ?? null) !== null) {
      console.log(
        `  #${m.id} ${m.key}: ${antesVal} → ${m.value} ${m.unit}${m.nullReason ? ` [${m.nullReason}]` : ""}`,
      );
    }
  }

  console.log("\n== DUPONT: ANTES → DESPUÉS ==");
  const dupontAntes = buildDupont({
    ventas: antes.ingresos,
    utilidadNeta: antes.utilidadNeta,
    activoTotal: antes.activoTotal,
    capitalContable: antes.patrimonio,
  });
  const dupontDespues = buildDupont({
    ventas: despues.ingresos,
    utilidadNeta: despues.utilidadNeta,
    activoTotal: despues.activoTotal,
    capitalContable: despues.patrimonio,
  });
  console.log("  ANTES:  ", JSON.stringify(dupontAntes));
  console.log("  DESPUÉS:", JSON.stringify(dupontDespues));

  console.log("\n== SALUD FINANCIERA (endeudamiento / patrimonio): ANTES → DESPUÉS ==");
  const structure = structureFromBalanza(balanza, COMPAC_ACCOUNT_ROLES);
  const pnl = pnlFromBalanza(balanza);
  const treasury = treasuryFromRows(tesoreria);
  const saludDespues = buildSaludFinanciera(structure, pnl, treasury);
  // ANTES: endeudamiento = |P| / |patrimonio crudo 3xxx|
  const endeudAntes = round2(Math.abs(structure.pasivoTotal) / Math.abs(structure.patrimonioNeto));
  console.log(`  endeudamientoTotal: ${endeudAntes} → ${saludDespues.endeudamientoTotal.value}`);
  console.log(`  endeudamiento denominador: ${Math.abs(structure.patrimonioNeto)} → ${saludDespues.endeudamientoTotal.denominator}`);
  console.log(`  patrimonioNeto línea: ${structure.patrimonioNeto} → ${saludDespues.patrimonioNeto.amount} (${saludDespues.patrimonioNeto.amountFormatted})`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
