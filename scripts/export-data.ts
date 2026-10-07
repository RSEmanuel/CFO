import "dotenv/config";
import { createWriteStream } from "node:fs";
import { Pool } from "pg";

/**
 * Exporta TODA la data de la base local a un archivo SQL portable
 * (TRUNCATE + INSERTs en orden topológico de llaves foráneas).
 * Uso: npm run db:export  ->  backup-cfo.sql
 * Restaurar en otra máquina: npm run db:import
 */

const OUTPUT_FILE = process.env.BACKUP_FILE ?? "backup-cfo.sql";
const BATCH_SIZE = 100;

type PgValue = null | boolean | number | string | bigint | Date | Buffer | Record<string, unknown> | unknown[];

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function serialize(value: PgValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listTables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

/** Ordena las tablas por dependencias FK para insertar padres antes que hijos. */
async function sortByForeignKeys(pool: Pool, tables: string[]): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string; foreign_table_name: string }>(
    `SELECT tc.table_name, ccu.table_name AS foreign_table_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const { table_name, foreign_table_name } of rows) {
    if (set.has(table_name) && set.has(foreign_table_name) && table_name !== foreign_table_name) {
      deps.get(table_name)!.add(foreign_table_name);
    }
  }
  const sorted: string[] = [];
  const done = new Set<string>();
  let pending = [...tables];
  while (pending.length > 0) {
    const ready = pending.filter((t) => [...deps.get(t)!].every((d) => done.has(d)));
    if (ready.length === 0) {
      // Ciclo de FKs: se insertan las restantes al final; el TRUNCATE CASCADE ya limpió todo.
      sorted.push(...pending);
      break;
    }
    for (const t of ready) {
      sorted.push(t);
      done.add(t);
    }
    pending = pending.filter((t) => !done.has(t));
  }
  return sorted;
}

async function sequenceResets(pool: Pool, tables: string[]): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`,
  );
  return rows
    .filter((r) => tables.includes(r.table_name))
    .map(
      (r) =>
        `SELECT setval(pg_get_serial_sequence('${r.table_name}', '${r.column_name}'), ` +
        `COALESCE((SELECT MAX(${quoteIdent(r.column_name)}) FROM ${quoteIdent(r.table_name)}), 1));`,
    );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en .env");

  const pool = new Pool({ connectionString: url, max: 1 });
  const tables = await sortByForeignKeys(pool, await listTables(pool));
  const out = createWriteStream(OUTPUT_FILE, { encoding: "utf8" });

  out.write(`-- Respaldo Cifra generado el ${new Date().toISOString()}\n`);
  out.write(`-- Restaurar con: npm run db:import (después de npx prisma migrate deploy)\n\nBEGIN;\n\n`);
  out.write(
    `TRUNCATE TABLE ${tables.map(quoteIdent).join(", ")} CASCADE;\n\n`,
  );

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT * FROM ${quoteIdent(table)}`);
    counts[table] = rows.length;
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]);
    const header = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES\n`;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = batch
        .map((row) => `(${columns.map((c) => serialize(row[c] as PgValue)).join(", ")})`)
        .join(",\n");
      out.write(`${header}${values};\n\n`);
    }
  }

  for (const stmt of await sequenceResets(pool, tables)) {
    out.write(`${stmt}\n`);
  }
  out.write(`\nCOMMIT;\n`);

  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });
  await pool.end();

  console.log(`\nRespaldo escrito en ${OUTPUT_FILE}`);
  console.log("Filas por tabla:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
