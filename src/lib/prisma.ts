import { AppError } from "@/auth/errors";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * El proxy local de `prisma dev` corta la conexión (ECONNRESET) a partir del
 * quinto socket simultáneo, aunque el Postgres detrás acepte 100. El default de
 * `pg` (10) provoca fallos intermitentes en las rutas que abren varias consultas
 * en paralelo, así que el pool se limita a 4 y se sube con DATABASE_POOL_MAX
 * cuando la base es RDS.
 *
 * En `next dev` el cliente vive en globalThis. Si el proceso arrancó ANTES de
 * `npx prisma generate`, los delegates nuevos quedan undefined. Recreamos el
 * cliente cuando falta alguno; si HMR no suelta el pool viejo, reinicia
 * `npm run dev`.
 */
const DEFAULT_POOL_MAX = 4;
const REQUIRED_DELEGATES = ["budgetAssumption", "auxiliarMovimiento", "auxiliarCuentaResumen", "poliza", "polizaMovimiento"] as const;

function resolvePoolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_POOL_MAX;
}

function hasDelegate(client: object, key: string): boolean {
  const delegate = (client as Record<string, { findMany?: unknown; deleteMany?: unknown } | undefined>)[key];
  return typeof delegate?.findMany === "function" || typeof delegate?.deleteMany === "function";
}

function isPrismaClientCurrent(client: PrismaClient): boolean {
  return REQUIRED_DELEGATES.every((key) => hasDelegate(client, key));
}

function hasBudgetAssumptionDelegate(client: PrismaClient): boolean {
  return hasDelegate(client, "budgetAssumption");
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env y configura AWS RDS.");
  }

  const pool = new Pool({
    connectionString,
    max: resolvePoolMax(),
    connectionTimeoutMillis: 0,
    keepAlive: true,
  });

  // Sin este listener, una conexión inactiva cerrada por el servidor se propaga
  // como error no controlado y tumba el proceso de Node.
  pool.on("error", (error) => {
    console.error("Pool de Postgres: conexión inactiva perdida.", error.message);
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

function resolvePrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && isPrismaClientCurrent(cached)) {
    return cached;
  }
  if (cached) {
    void cached.$disconnect().catch(() => undefined);
  }
  const next = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = next;
  }
  return next;
}

/**
 * Proxy para que `next dev` no se quede con un PrismaClient creado antes de
 * `prisma generate`. Cada acceso revalida los delegates y recrea el cliente.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolvePrismaClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});

const STALE_CLIENT_MESSAGE =
  "El cliente de Prisma está desactualizado. Reinicia `npm run dev` y ejecuta `npx prisma generate`.";

export function requireBudgetAssumptionDelegate(): void {
  if (!hasBudgetAssumptionDelegate(prisma)) {
    throw new AppError("INTERNAL_ERROR", STALE_CLIENT_MESSAGE, 503);
  }
}

export function requireCurrentPrismaClient(): void {
  if (!isPrismaClientCurrent(prisma)) {
    throw new AppError("INTERNAL_ERROR", STALE_CLIENT_MESSAGE, 503);
  }
}
