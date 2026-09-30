import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Restaura un respaldo generado por scripts/export-data.ts.
 * Uso: npm run db:import   (lee backup-cfo.sql, o BACKUP_FILE=otro.sql)
 * Requiere que el esquema ya exista: correr antes `npx prisma migrate deploy`.
 */

const INPUT_FILE = process.env.BACKUP_FILE ?? "backup-cfo.sql";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en .env");

  const sql = readFileSync(INPUT_FILE, "utf8");
  if (!sql.includes("INSERT INTO") && !sql.includes("TRUNCATE")) {
    throw new Error(`${INPUT_FILE} no parece un respaldo válido.`);
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query(sql);
  await pool.end();
  console.log(`Respaldo ${INPUT_FILE} restaurado correctamente.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
