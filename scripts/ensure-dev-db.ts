import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { createConnection } from "node:net";
import { join } from "node:path";

/**
 * Levanta la base local de `prisma dev` antes de `next dev`. Sin esto, la app
 * arranca pero toda consulta falla con ECONNREFUSED, porque `next dev` no sabe
 * nada del servidor de Postgres.
 */
const SERVER_NAME = "cfo";
const START_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 30_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type Target = { host: string; port: number; shadowPort: number | null };

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const port = Number(new URL(value).port);
  return Number.isInteger(port) && port > 0 ? port : null;
}

function resolveTarget(): Target | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.");
  }
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return null;
  }
  const port = parsePort(raw);
  if (!port) {
    throw new Error(`DATABASE_URL no tiene un puerto válido: ${url.hostname}`);
  }
  return { host: url.hostname, port, shadowPort: parsePort(process.env.SHADOW_DATABASE_URL) };
}

function canConnect(host: string, port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function runPrisma(args: string[]): boolean {
  // Se ejecuta a través del shell porque Windows rechaza invocar npx.cmd
  // directamente. Los argumentos son constantes internas y números de puerto.
  // `stdio: "inherit"` es necesario: con tuberías capturadas el comando nunca
  // termina, porque el servidor que queda en segundo plano las deja abiertas.
  try {
    execSync(`npx prisma ${args.join(" ")}`, {
      stdio: "inherit",
      timeout: START_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    console.warn(
      `Falló "prisma ${args.join(" ")}": ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

function devDataDir(): string {
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "prisma-dev-nodejs", "Data");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "prisma-dev-nodejs", "Data");
  }
  return join(homedir(), ".local", "share", "prisma-dev-nodejs", "Data");
}

/**
 * Si el servidor muere sin liberar su candado (apagón, cierre forzado de la
 * terminal), queda un directorio `server.lock.lock` y todo arranque posterior
 * falla con "Lock file is already being held". Solo se borra cuando el puerto
 * está libre, es decir cuando no hay ningún servidor realmente sirviendo.
 */
function clearStaleLock(): boolean {
  const lock = join(devDataDir(), "durable-streams", SERVER_NAME, "server.lock.lock");
  if (!existsSync(lock)) {
    return false;
  }
  try {
    rmSync(lock, { recursive: true, force: true });
    console.log("Se liberó un candado obsoleto de la base local.");
    return true;
  } catch (error) {
    console.warn(`No se pudo liberar el candado ${lock}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function waitUntilReady(target: Target): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await canConnect(target.host, target.port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main(): Promise<void> {
  const target = resolveTarget();
  if (!target) {
    console.log("DATABASE_URL apunta a una base remota: no hay nada que levantar.");
    return;
  }

  if (await canConnect(target.host, target.port)) {
    console.log(`Base local lista en el puerto ${target.port}.`);
    return;
  }

  console.log(`Levantando la base local "${SERVER_NAME}" en el puerto ${target.port}...`);

  // El servidor con nombre conserva sus puertos y sus datos entre reinicios.
  let started = runPrisma(["dev", "start", SERVER_NAME]);
  if (!started && clearStaleLock()) {
    started = runPrisma(["dev", "start", SERVER_NAME]);
  }
  // Si el servidor todavía no existe (clon nuevo), se crea fijando los puertos
  // de .env para que la cadena de conexión nunca quede desalineada.
  if (!started) {
    const createArgs = ["dev", "--name", SERVER_NAME, "--detach", "--db-port", String(target.port)];
    if (target.shadowPort) {
      createArgs.push("--shadow-db-port", String(target.shadowPort));
    }
    runPrisma(createArgs);
  }

  if (!(await waitUntilReady(target))) {
    throw new Error(
      `La base local no respondió en el puerto ${target.port}. Revisa con "npx prisma dev ls" ` +
        `y arráncala con "npm run db:start".`,
    );
  }
  console.log(`Base local lista en el puerto ${target.port}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
