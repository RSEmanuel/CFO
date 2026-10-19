import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeTenantRfc } from "../src/services/tenants/constants";

/**
 * Cambia solo el nombre de una empresa, buscada por RFC. No toca usuarios ni datos contables.
 * Pide escribir "SI" en una terminal interactiva antes de guardar; sin terminal aborta.
 *
 * Uso:
 *   npx tsx scripts/rename-tenant.ts <rfc> "Nombre Nuevo"
 *
 * Contra producción (variables de .env.production):
 *   (set -a; source .env.production; set +a; npx tsx scripts/rename-tenant.ts <rfc> "Nombre Nuevo")
 */
const USAGE = 'Uso: npx tsx scripts/rename-tenant.ts <rfc> "Nombre Nuevo"';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim() === "SI";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const [rawRfc, rawName] = process.argv.slice(2);
  const rfc = rawRfc ? normalizeTenantRfc(rawRfc) : "";
  const newName = rawName?.trim() ?? "";
  if (!rfc || !newName) {
    throw new Error(`Faltan argumentos. ${USAGE}`);
  }
  if (!process.stdin.isTTY) {
    throw new Error('Este script pide escribir "SI" y necesita una terminal interactiva. Córrelo directamente en tu terminal.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    console.log(`Base: ${new URL(connectionString).hostname}`);
    const tenant = await prisma.tenant.findUnique({ where: { rfc }, select: { id: true, name: true, rfc: true } });
    if (!tenant) {
      throw new Error(`No existe una empresa con RFC ${rfc}.`);
    }

    console.log(`Empresa: ${tenant.rfc} (id ${tenant.id})`);
    console.log(`Nombre actual: ${tenant.name}`);
    console.log(`Nombre nuevo:  ${newName}`);
    if (tenant.name === newName) {
      console.log("Ya tiene ese nombre. Nada que hacer.");
      return;
    }

    if (!(await confirm('Escribe "SI" para guardar el cambio: '))) {
      console.log("Cancelado. Nada se modificó.");
      return;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: newName },
      select: { id: true, name: true, rfc: true, updatedAt: true },
    });
    console.log("Empresa actualizada:");
    console.log(`  id=${updated.id}`);
    console.log(`  rfc=${updated.rfc}`);
    console.log(`  name=${updated.name}`);
    console.log(`  updatedAt=${updated.updatedAt.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
