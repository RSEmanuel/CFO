import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitIngestFiles } from "../src/services/ingestionService";
import { prisma } from "../src/lib/prisma";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Ingesta REAL de la historia CONTPAQi 2024-08 → 2026-06 de:
 *   03.xx Flujo de Efectivo            → tesoreria_flujos + tesoreria_flujo_detalle
 *   06.xx Auxiliares del catálogo MXN  → auxiliar_movimientos + auxiliar_cuenta_resumen (MXN)
 *   07.xx Auxiliares del catálogo USD  → auxiliar_movimientos + auxiliar_cuenta_resumen (USD)
 * por la MISMA ruta del portal: commitIngestFiles con useFilePeriod=true.
 * Un archivo = un periodo = una llamada.
 *
 * Tras CADA commit se verifica el rowcount real en la tabla correspondiente;
 * si el servicio reporta éxito pero persistió 0 filas (rollback silencioso
 * histórico), el script se detiene y lo reporta.
 *
 * Ancla jul-2026 (ya certificado): se verifica intacta al inicio y al final.
 *
 * Uso: npx tsx scripts/ingest-aux-flujo-history.ts
 */

const DIR = join(__dirname, "..", "Data_ejemplo");
const FILE_PATTERN = /^(03|06|07)\.\d{2} .+\d{6}( MXN| USD)?\.xlsx$/;
const JULY_GUARD = { anio: 2026, periodo: 7 } as const;
// La sesión apunta a jul-2026, pero useFilePeriod manda: el Excel fija el periodo.
const SESSION_PERIODO = 7;
const SESSION_ANIO = 2026;

type Kind = "flujo" | "auxiliar";
type FileSpec = { filename: string; kind: Kind; moneda: "MXN" | "USD" | null };

function classify(filename: string): FileSpec {
  if (filename.startsWith("03")) return { filename, kind: "flujo", moneda: null };
  if (filename.startsWith("06")) return { filename, kind: "auxiliar", moneda: "MXN" };
  return { filename, kind: "auxiliar", moneda: "USD" };
}

async function julyAnchor(tenantId: string) {
  const [balanza, auxMovMxn, auxMovUsd, resMxn, resUsd, tes, tesDet] = await Promise.all([
    prisma.balanzaPnL.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.auxiliarMovimiento.count({ where: { tenantId, ...JULY_GUARD, moneda: "MXN" } }),
    prisma.auxiliarMovimiento.count({ where: { tenantId, ...JULY_GUARD, moneda: "USD" } }),
    prisma.auxiliarCuentaResumen.count({ where: { tenantId, ...JULY_GUARD, moneda: "MXN" } }),
    prisma.auxiliarCuentaResumen.count({ where: { tenantId, ...JULY_GUARD, moneda: "USD" } }),
    prisma.tesoreriaFlujo.count({ where: { tenantId, ...JULY_GUARD } }),
    prisma.tesoreriaFlujoDetalle.count({ where: { tenantId, ...JULY_GUARD } }),
  ]);
  return { balanza, auxMovMxn, auxMovUsd, resMxn, resUsd, tes, tesDet };
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } });
  if (!tenant) throw new Error(`No existe el tenant Compac (${EMPTY_COMPAC_TENANT.rfc}).`);
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "CFO_PARTNER", email: "compac.partner@cfo.mx" },
  });
  if (!user) throw new Error("No existe un usuario CFO_PARTNER del tenant Compac.");
  console.log(`Tenant: ${tenant.name} id=${tenant.id}`);
  console.log(`Usuario: ${user.email} id=${user.id}\n`);

  const before = await julyAnchor(tenant.id);
  console.log(`Ancla 2026-07 antes: ${JSON.stringify(before)}\n`);

  const files = readdirSync(DIR).filter((name) => FILE_PATTERN.test(name)).sort().map(classify);
  console.log(`Archivos a ingerir: ${files.length}\n`);

  const results: Array<{
    filename: string;
    kind: Kind;
    moneda: string | null;
    anio: number;
    periodo: number;
    reported: number;
    persisted: number;
    extra: number;
    warnings: number;
    ms: number;
  }> = [];
  const warningMessages = new Map<string, number>();

  for (const spec of files) {
    const buffer = readFileSync(join(DIR, spec.filename));
    const startedAt = Date.now();
    const result = await commitIngestFiles({
      tenantId: tenant.id,
      userId: user.id,
      periodo: SESSION_PERIODO,
      anio: SESSION_ANIO,
      files: [{ filename: spec.filename, buffer }],
      useFilePeriod: true,
    });
    const ms = Date.now() - startedAt;
    const where = { tenantId: tenant.id, anio: result.anio, periodo: result.periodo };

    let reported: number;
    let persisted: number;
    let extra: number;
    if (spec.kind === "flujo") {
      reported = result.counts.tesoreria;
      persisted = await prisma.tesoreriaFlujo.count({ where });
      extra = await prisma.tesoreriaFlujoDetalle.count({ where });
      if (persisted === 0 || extra === 0) {
        throw new Error(
          `ROLLBACK SILENCIOSO: ${spec.filename} reportó tesoreria=${reported} pero tesoreria_flujos=${persisted} detalle=${extra} en ${result.anio}-${result.periodo}.`,
        );
      }
    } else {
      reported = result.counts.auxiliarMovimientos;
      persisted = await prisma.auxiliarMovimiento.count({ where: { ...where, moneda: spec.moneda! } });
      extra = await prisma.auxiliarCuentaResumen.count({ where: { ...where, moneda: spec.moneda! } });
      if (persisted === 0 || extra === 0) {
        throw new Error(
          `ROLLBACK SILENCIOSO: ${spec.filename} reportó auxiliarMovimientos=${reported} pero auxiliar_movimientos=${persisted} resumen=${extra} en ${result.anio}-${result.periodo} ${spec.moneda}.`,
        );
      }
    }
    if (persisted !== reported) {
      throw new Error(
        `Diferencia reportado/persistido en ${spec.filename}: reportado=${reported} persistido=${persisted}.`,
      );
    }
    for (const warning of result.warnings) {
      warningMessages.set(warning.message, (warningMessages.get(warning.message) ?? 0) + 1);
    }
    results.push({
      ...spec,
      anio: result.anio,
      periodo: result.periodo,
      reported,
      persisted,
      extra,
      warnings: result.warnings.length,
      ms,
    });
    console.log(
      `${spec.filename} → ${result.anio}-${String(result.periodo).padStart(2, "0")} ` +
        `${spec.kind}${spec.moneda ? " " + spec.moneda : ""} reportado=${reported} persistido=${persisted} ` +
        `${spec.kind === "flujo" ? "detalle" : "resumen"}=${extra} warnings=${result.warnings.length} (${ms}ms)`,
    );
  }

  const after = await julyAnchor(tenant.id);
  console.log(`\nAncla 2026-07 después: ${JSON.stringify(after)}`);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("La ingesta tocó el periodo certificado 2026-07.");
  }

  console.log("\n== RESUMEN ==");
  for (const row of results) {
    console.log(
      `  ${row.anio}-${String(row.periodo).padStart(2, "0")} ${row.kind.padEnd(8)} ${row.moneda ?? "   "}: ` +
        `persistido=${row.persisted} ${row.kind === "flujo" ? "detalle" : "resumen"}=${row.extra} warnings=${row.warnings}`,
    );
  }
  console.log("\n== WARNINGS DISTINTOS ==");
  for (const [message, count] of [...warningMessages.entries()].sort()) {
    console.log(`  ×${count}  ${message}`);
  }
  console.log(`\nOK: ${results.length} archivos ingeridos por la ruta del portal.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
