import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { CategoriaMaestra } from "../src/generated/prisma/enums";
import { classifyCategoria, isDepreciation } from "../src/services/ingest/accountClassify";
import { COMPAC_BALANZA_PROFILE } from "../src/services/ingest/builtinProfiles";

/**
 * Re-etiquetado idempotente (auditoría B1/B2): recalcula categoriaMaestra y el
 * flag depreciacionAmortizacion de balanzas_pnl con el clasificador corregido:
 * - nameExceptions ("depreciacion|amortizacion" → OpEx) solo aplican a PyG
 *   (4xxx–8xxx); 1200/1202 vuelven a Activo (contra-activo).
 * - El flag D&A solo se enciende en cuentas de PyG (la D&A del EBITDA no debe
 *   mezclar balance con resultado).
 *
 * Segunda corrida: 0 filas actualizadas. Solo DB local.
 * Uso: npx tsx scripts/reclassify-balanza-categories.ts
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function requireLocalConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`reclassify-balanza-categories solo puede ejecutarse contra una DB local; host: ${url.hostname}.`);
  }
  return connectionString;
}

const COMPAC_RULES = COMPAC_BALANZA_PROFILE.accountPrefixRules;

async function main(): Promise<void> {
  const connectionString = requireLocalConnectionString();
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 0, keepAlive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const rows = await prisma.balanzaPnL.findMany({
      select: { id: true, idCuenta: true, nombreCuenta: true, categoriaMaestra: true, depreciacionAmortizacion: true },
    });
    console.log(`Filas en balanzas_pnl: ${rows.length}`);

    const antes = new Map<string, number>();
    for (const row of rows) {
      antes.set(row.categoriaMaestra, (antes.get(row.categoriaMaestra) ?? 0) + 1);
    }
    console.log("\nAntes (filas por categoriaMaestra):");
    for (const [categoria, n] of [...antes.entries()].sort()) {
      console.log(`  ${categoria}: ${n}`);
    }

    // Agrupa los ids a actualizar por (nuevaCategoria, nuevoDa) para hacer un
    // solo updateMany por combinación.
    const grupos = new Map<string, { categoria: CategoriaMaestra; da: boolean; ids: string[] }>();
    const detalle = new Map<string, { nombre: string; de: string; a: string; daDe: boolean; daA: boolean; filas: number }>();
    for (const row of rows) {
      const categoria = classifyCategoria(row.idCuenta, row.nombreCuenta, COMPAC_RULES);
      const da = isDepreciation(row.nombreCuenta, row.idCuenta);
      if (categoria === row.categoriaMaestra && da === row.depreciacionAmortizacion) {
        continue;
      }
      const key = `${categoria}|${da}`;
      const grupo = grupos.get(key) ?? { categoria, da, ids: [] };
      grupo.ids.push(row.id);
      grupos.set(key, grupo);

      const detalleKey = `${row.idCuenta}|${row.categoriaMaestra}|${categoria}|${row.depreciacionAmortizacion}|${da}`;
      const item = detalle.get(detalleKey) ?? {
        nombre: row.nombreCuenta,
        de: row.categoriaMaestra,
        a: categoria,
        daDe: row.depreciacionAmortizacion,
        daA: da,
        filas: 0,
      };
      item.filas += 1;
      detalle.set(detalleKey, item);
    }

    if (grupos.size === 0) {
      console.log("\nNada que actualizar: la clasificación persistida ya coincide con el clasificador corregido.");
      return;
    }

    console.log(`\nCuentas a reclasificar (${detalle.size} distintas):`);
    for (const [key, item] of [...detalle.entries()].sort()) {
      const idCuenta = key.split("|")[0];
      console.log(
        `  ${idCuenta} | ${item.nombre} | ${item.de} → ${item.a} | da ${item.daDe} → ${item.daA} | ${item.filas} filas`,
      );
    }

    let actualizadas = 0;
    for (const grupo of grupos.values()) {
      const result = await prisma.balanzaPnL.updateMany({
        where: { id: { in: grupo.ids } },
        data: { categoriaMaestra: grupo.categoria, depreciacionAmortizacion: grupo.da },
      });
      actualizadas += result.count;
    }
    console.log(`\nFilas actualizadas: ${actualizadas}`);

    const despuesRows = await prisma.balanzaPnL.groupBy({
      by: ["categoriaMaestra"],
      _count: true,
      orderBy: { categoriaMaestra: "asc" },
    });
    console.log("\nDespués (filas por categoriaMaestra):");
    for (const row of despuesRows) {
      console.log(`  ${row.categoriaMaestra}: ${row._count}`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
