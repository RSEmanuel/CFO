import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parse } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  generateExampleCompany,
  lastClosedPeriod,
  type ExampleCompany,
} from "../src/services/exampleCompanyGenerator";
import { EXAMPLE_TENANT, isExampleTenantRfc, normalizeTenantRfc } from "../src/services/tenants/constants";

/**
 * Carga (o recarga) la empresa de demostración «Distribuidora Ejemplo» y da a UNA persona de solo
 * consulta acceso a ella además de a su empresa real.
 *
 * Reglas que este guion se impone a sí mismo:
 * - Solo escribe en la empresa de ejemplo (se identifica por su RFC y su nombre debe decir «ejemplo»).
 *   Nunca toca la empresa real de la persona ni a ningún otro cliente.
 * - Nunca cambia el rol de nadie. Si la persona no es de solo consulta, se detiene.
 * - Se niega a correr contra localhost: es para la base publicada.
 * - Antes de escribir imprime el servidor y la empresa destino, y exige confirmación escrita.
 *
 * Uso (desde la carpeta del proyecto):
 *   npx tsx scripts/seed-example-company.ts --env=.env.production --dry-run
 *       Genera y valida las cifras en memoria. No abre ninguna conexión.
 *   npx tsx scripts/seed-example-company.ts --env=.env.production [--jorge] [--email=a@x.com,b@y.com]
 *       Revisa la base (solo lectura), imprime el plan y se detiene a pedir confirmación.
 *   (mismas opciones) --confirmo=SI
 *       Escribe. Se puede repetir: borra y vuelve a cargar solo las cifras de la empresa de ejemplo y
 *       conserva todos los accesos que ya existen (los de las demás personas no se tocan).
 *
 * Personas: --email acepta uno o varios correos (coincidencia exacta, sin distinguir mayúsculas);
 * --jorge agrega a la única persona con «jorge» en el correo (si no das ningún --email, se asume --jorge).
 * A quien sea de solo consulta se le da acceso a la empresa de ejemplo (quedan exactamente dos empresas);
 * a quien sea administrador o socio no se le agrega nada: ya ve todas.
 *
 * No usa .env a menos que se lo indiques con --env: la base se toma del archivo indicado, no del entorno.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const CHUNK = 1_000;

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`\nSe detuvo, no se escribió nada: ${message}`);
  process.exit(1);
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function resolveHasta(): { anio: number; periodo: number } {
  const raw = flag("hasta");
  if (!raw) {
    return lastClosedPeriod(new Date());
  }
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    fail(`--hasta debe verse así: 2026-10 (recibí «${raw}»).`);
  }
  return { anio: Number(match![1]), periodo: Number(match![2]) };
}

function describeCompany(company: ExampleCompany): void {
  const first = company.periods[0]!;
  const last = company.periods[company.periods.length - 1]!;
  console.log(`Periodos: ${company.periods.length} (de ${first.anio}-${String(first.periodo).padStart(2, "0")} a ${last.anio}-${String(last.periodo).padStart(2, "0")})`);
  console.log(
    [
      `balanza ${company.balanza.length}`,
      `facturas de venta ${company.ventas.length}`,
      `facturas de proveedores ${company.egresos.length}`,
      `flujo ${company.flujos.length}`,
      `detalle de flujo ${company.flujoDetalle.length}`,
      `movimientos de auxiliar ${company.auxMovimientos.length}`,
      `resumen de auxiliar ${company.auxResumen.length}`,
      `pólizas ${company.polizas.length}`,
      `movimientos de póliza ${company.polizaMovimientos.length}`,
      `catálogo ${company.catalogo.length}`,
      `supuestos de presupuesto ${company.budgetAssumptions.length}`,
    ].join(" · "),
  );
}

function assertExampleName(): void {
  if (!/ejemplo/i.test(EXAMPLE_TENANT.name) || !isExampleTenantRfc(EXAMPLE_TENANT.rfc)) {
    fail("el nombre de la empresa destino no contiene «ejemplo».");
  }
}

function readDatabaseUrl(envFile: string): string {
  let raw: string;
  try {
    raw = readFileSync(envFile, "utf8");
  } catch {
    fail(`no pude leer el archivo ${envFile}.`);
  }
  const url = parse(raw).DATABASE_URL;
  if (!url) {
    fail(`${envFile} no trae DATABASE_URL.`);
  }
  return url;
}

type Client = PrismaClient;
type TenantTables = {
  balanza: number;
  ventas: number;
  egresos: number;
  flujos: number;
  flujoDetalle: number;
  auxMovimientos: number;
  auxResumen: number;
  catalogo: number;
  polizas: number;
  polizaMovimientos: number;
  presupuesto: number;
};

async function countTenant(db: Pick<Client, "balanzaPnL" | "auxiliarVentas" | "auxiliarEgresos" | "tesoreriaFlujo" | "tesoreriaFlujoDetalle" | "auxiliarMovimiento" | "auxiliarCuentaResumen" | "cuentaCatalogo" | "poliza" | "polizaMovimiento" | "budgetAssumption">, tenantId: string): Promise<TenantTables> {
  const where = { where: { tenantId } };
  const [balanza, ventas, egresos, flujos, flujoDetalle, auxMovimientos, auxResumen, catalogo, polizas, polizaMovimientos, presupuesto] = await Promise.all([
    db.balanzaPnL.count(where),
    db.auxiliarVentas.count(where),
    db.auxiliarEgresos.count(where),
    db.tesoreriaFlujo.count(where),
    db.tesoreriaFlujoDetalle.count(where),
    db.auxiliarMovimiento.count(where),
    db.auxiliarCuentaResumen.count(where),
    db.cuentaCatalogo.count(where),
    db.poliza.count(where),
    db.polizaMovimiento.count(where),
    db.budgetAssumption.count(where),
  ]);
  return { balanza, ventas, egresos, flujos, flujoDetalle, auxMovimientos, auxResumen, catalogo, polizas, polizaMovimientos, presupuesto };
}

function sameCounts(a: TenantTables, b: TenantTables): boolean {
  return (Object.keys(a) as Array<keyof TenantTables>).every((key) => a[key] === b[key]);
}

async function chunked<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

async function main(): Promise<void> {
  assertExampleName();
  const hasta = resolveHasta();
  const company = generateExampleCompany(hasta);
  console.log("Cifras de ejemplo generadas y cuadradas en memoria.");
  describeCompany(company);

  if (has("dry-run")) {
    console.log("\n--dry-run: no se abrió ninguna conexión y no se escribió nada.");
    return;
  }

  const envFile = flag("env");
  if (!envFile) {
    fail("indica el archivo de la base con --env=.env.production.");
  }
  const connectionString = readDatabaseUrl(envFile);
  const url = new URL(connectionString);
  if (LOCAL_HOSTS.has(url.hostname)) {
    fail(`el servidor es ${url.hostname}: este guion solo se corre contra la base publicada.`);
  }
  const server = `${url.hostname}:${url.port || "5432"}${url.pathname}`;

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // Revisión previa: solo lecturas.
    const table = await db.$queryRaw<Array<{ ok: string | null }>>`select to_regclass('public.user_tenant_access')::text as ok`;
    if (!table[0]?.ok) {
      fail("la base publicada todavía no tiene la actualización que permite ver dos empresas. Primero hay que publicar esa actualización.");
    }

    const exactEmails = (flag("email") ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    const wantJorge = has("jorge") || exactEmails.length === 0;
    type Person = Awaited<ReturnType<typeof loadPerson>>;
    const loadPerson = (where: object) =>
      db.user.findMany({ where, include: { tenant: { select: { id: true, name: true, rfc: true } } } });

    const people: Array<NonNullable<Person>[number]> = [];
    for (const email of exactEmails) {
      const found = await loadPerson({ email: { equals: email, mode: "insensitive" } });
      if (found.length === 1) {
        people.push(found[0]!);
        continue;
      }
      if (found.length > 1) {
        fail(`hay ${found.length} usuarios con el correo ${email}; no puedo elegir.`);
      }
      const local = email.split("@")[0]!.toLowerCase();
      const similar = await db.user.findMany({
        where: { OR: [{ email: { contains: local.slice(0, Math.max(4, Math.min(local.length, 6))), mode: "insensitive" } }, { email: { contains: local.replace(/[^a-z]/g, "").slice(0, 5), mode: "insensitive" } }] },
        select: { email: true },
        take: 10,
      });
      fail(
        `no existe un usuario con el correo exacto ${email}.` +
          (similar.length > 0 ? ` Correos parecidos: ${similar.map((u) => u.email).join(", ")}.` : " No hay correos parecidos."),
      );
    }
    if (wantJorge) {
      const found = await loadPerson({ email: { contains: "jorge", mode: "insensitive" } });
      if (found.length === 0) {
        fail("no encontré ningún usuario con «jorge» en el correo. Dame el correo con --email=.");
      }
      if (found.length > 1) {
        fail(`hay ${found.length} usuarios que podrían ser Jorge (${found.map((c) => c.email).join(", ")}). Dime cuál con --email=.`);
      }
      people.push(found[0]!);
    }
    const unique = [...new Map(people.map((person) => [person.id, person])).values()];

    for (const person of unique) {
      if (!person.isActive) {
        fail(`${person.email} está desactivado.`);
      }
      if (normalizeTenantRfc(person.tenant.rfc) === normalizeTenantRfc(EXAMPLE_TENANT.rfc)) {
        fail(`la empresa actual de ${person.email} ya es la de ejemplo.`);
      }
    }
    const viewers = unique.filter((person) => person.role === "CLIENT_VIEWER");
    const staff = unique.filter((person) => person.role !== "CLIENT_VIEWER");
    for (const viewer of viewers) {
      const otras = await db.userTenantAccess.findMany({
        where: { userId: viewer.id },
        include: { tenant: { select: { name: true, rfc: true } } },
      });
      const ajenas = otras.filter((row) => !isExampleTenantRfc(row.tenant.rfc));
      if (ajenas.length > 0) {
        fail(`${viewer.email} ya puede abrir otras empresas (${ajenas.map((row) => row.tenant.name).join(", ")}): no quedaría con exactamente dos. Dime qué hacer.`);
      }
    }

    const existing = await db.tenant.findUnique({ where: { rfc: EXAMPLE_TENANT.rfc } });
    if (existing) {
      if (!/ejemplo/i.test(existing.name)) {
        fail(`ya existe una empresa con el RFC ${EXAMPLE_TENANT.rfc} pero su nombre («${existing.name}») no contiene «ejemplo».`);
      }
      const [usuarios, cargas] = await Promise.all([
        db.user.count({ where: { tenantId: existing.id } }),
        db.ingestBatch.count({ where: { tenantId: existing.id } }),
      ]);
      if (usuarios > 0 || cargas > 0) {
        fail("la empresa de ejemplo tiene usuarios o cargas de archivos propias; no es una empresa de solo demostración.");
      }
    }
    const realTenants = [...new Map(viewers.map((viewer) => [viewer.tenant.id, viewer.tenant])).values()];
    const antes = new Map<string, TenantTables>();
    for (const tenant of realTenants) {
      antes.set(tenant.id, await countTenant(db, tenant.id));
    }
    const grantees = existing
      ? await db.userTenantAccess.findMany({ where: { tenantId: existing.id }, include: { user: { select: { email: true } } } })
      : [];
    const previo = existing ? await countTenant(db, existing.id) : null;

    console.log("\n================ PLAN (todavía no se escribe nada) ================");
    console.log(`Servidor de la base:   ${server}`);
    console.log(`Empresa destino:       ${EXAMPLE_TENANT.name}  (RFC ${EXAMPLE_TENANT.rfc})  ${existing ? "→ ya existe: se borra y se vuelve a cargar SOLO esta" : "→ se crea nueva"}`);
    if (previo) {
      console.log(`  registros actuales de esa empresa de ejemplo: ${JSON.stringify(previo)}`);
    }
    for (const viewer of viewers) {
      console.log(`Persona (solo consulta): ${viewer.email}  rol ${viewer.role} (no cambia)`);
      console.log(`  su empresa real:       ${viewer.tenant.name}  (RFC ${viewer.tenant.rfc})  → no se toca`);
      console.log(`  empresas que podrá abrir: 1) ${viewer.tenant.name}  2) ${EXAMPLE_TENANT.name}`);
      console.log(`  registros de su empresa real, para comparar al final: ${JSON.stringify(antes.get(viewer.tenant.id))}`);
    }
    for (const member of staff) {
      console.log(`Persona (${member.role}): ${member.email}  empresa ${member.tenant.name}`);
      console.log("  no se le agrega acceso extra: ya ve todas las empresas, y la de ejemplo le aparecerá en su lista.");
    }
    console.log(`Accesos que ya existen a la empresa de ejemplo (se conservan): ${grantees.length === 0 ? "ninguno" : grantees.map((row) => row.user.email).join(", ")}`);
    console.log("====================================================================");

    if (flag("confirmo") !== "SI") {
      if (process.stdin.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = (await rl.question("\nEscribe SI para escribir en esa base: ")).trim();
        rl.close();
        if (answer !== "SI") {
          fail("no escribiste SI.");
        }
      } else {
        console.log("\nFalta confirmación. Para escribir, vuelve a correrlo con --confirmo=SI. No se escribió nada.");
        return;
      }
    }

    // Escritura: una sola transacción; si algo no cuadra, se deshace completa.
    const result = await db.$transaction(
      async (tx) => {
        const tenant = existing
          ? await tx.tenant.update({ where: { id: existing.id }, data: { name: EXAMPLE_TENANT.name } })
          : await tx.tenant.create({ data: { name: EXAMPLE_TENANT.name, rfc: EXAMPLE_TENANT.rfc } });
        const tenantId = tenant.id;
        if (realTenants.some((real) => real.id === tenantId)) {
          throw new Error("La empresa destino coincide con una empresa real: se cancela.");
        }
        const accesosAntes = await tx.userTenantAccess.findMany({ where: { tenantId }, select: { userId: true } });
        const scope = { where: { tenantId } };

        await tx.polizaMovimiento.deleteMany(scope);
        await tx.poliza.deleteMany(scope);
        await tx.auxiliarMovimiento.deleteMany(scope);
        await tx.auxiliarCuentaResumen.deleteMany(scope);
        await tx.tesoreriaFlujoDetalle.deleteMany(scope);
        await tx.tesoreriaFlujo.deleteMany(scope);
        await tx.auxiliarEgresos.deleteMany(scope);
        await tx.auxiliarVentas.deleteMany(scope);
        await tx.balanzaPnL.deleteMany(scope);
        await tx.cuentaCatalogo.deleteMany(scope);
        await tx.budgetAssumption.deleteMany(scope);

        await tx.cuentaCatalogo.createMany({ data: company.catalogo.map((c) => ({ tenantId, ...c })) });
        await chunked(company.balanza, (batch) =>
          tx.balanzaPnL.createMany({ data: batch.map((r) => ({ tenantId, ...r })) }),
        );
        await chunked(company.ventas, (batch) =>
          tx.auxiliarVentas.createMany({
            data: batch.map((r) => ({ tenantId, ...r, fechaEmision: toDate(r.fechaEmision), fechaVencimiento: toDate(r.fechaVencimiento) })),
          }),
        );
        await chunked(company.egresos, (batch) =>
          tx.auxiliarEgresos.createMany({
            data: batch.map((r) => ({ tenantId, ...r, fechaEmision: toDate(r.fechaEmision), fechaVencimiento: toDate(r.fechaVencimiento) })),
          }),
        );
        await chunked(company.flujos, (batch) => tx.tesoreriaFlujo.createMany({ data: batch.map((r) => ({ tenantId, ...r })) }));
        await chunked(company.flujoDetalle, (batch) => tx.tesoreriaFlujoDetalle.createMany({ data: batch.map((r) => ({ tenantId, ...r })) }));
        await chunked(company.auxResumen, (batch) => tx.auxiliarCuentaResumen.createMany({ data: batch.map((r) => ({ tenantId, ...r })) }));
        await chunked(company.auxMovimientos, (batch) =>
          tx.auxiliarMovimiento.createMany({ data: batch.map((r) => ({ tenantId, ...r, fecha: toDate(r.fecha) })) }),
        );
        await chunked(company.polizas, (batch) =>
          tx.poliza.createMany({ data: batch.map((r) => ({ tenantId, ...r, fecha: toDate(r.fecha) })) }),
        );
        await chunked(company.polizaMovimientos, (batch) => tx.polizaMovimiento.createMany({ data: batch.map((r) => ({ tenantId, ...r })) }));
        await tx.budgetAssumption.createMany({ data: company.budgetAssumptions.map((r) => ({ tenantId, ...r })) });

        for (const viewer of viewers) {
          await tx.userTenantAccess.upsert({
            where: { userId_tenantId: { userId: viewer.id, tenantId } },
            create: { userId: viewer.id, tenantId },
            update: {},
          });
        }

        // Candados finales dentro de la transacción: si fallan, no queda nada.
        for (const real of realTenants) {
          const despues = await countTenant(tx, real.id);
          if (!sameCounts(antes.get(real.id)!, despues)) {
            throw new Error(`El conteo de la empresa real «${real.name}» cambió: se deshace todo.`);
          }
        }
        for (const person of unique) {
          const after = await tx.user.findUnique({ where: { id: person.id }, select: { role: true, tenantId: true } });
          if (after?.role !== person.role || after.tenantId !== person.tenantId) {
            throw new Error(`El rol o la empresa de ${person.email} cambió: se deshace todo.`);
          }
        }
        for (const viewer of viewers) {
          const rows = await tx.userTenantAccess.findMany({ where: { userId: viewer.id }, select: { tenantId: true } });
          if (rows.length !== 1 || rows[0]!.tenantId !== tenantId) {
            throw new Error(`${viewer.email} debe quedar con exactamente dos empresas: se deshace todo.`);
          }
        }
        const accesosDespues = await tx.userTenantAccess.findMany({ where: { tenantId }, select: { userId: true } });
        const conservados = new Set(accesosDespues.map((row) => row.userId));
        if (accesosAntes.some((row) => !conservados.has(row.userId))) {
          throw new Error("Se perdió un acceso que ya existía: se deshace todo.");
        }
        const despuesReal = Object.fromEntries(realTenants.map((real) => [real.name, "sin cambios"]));
        return { tenantId, cargado: await countTenant(tx, tenantId), despuesReal, accesos: accesosDespues.length };
      },
      { timeout: 300_000, maxWait: 30_000 },
    );

    console.log("\nListo. Cargado en la empresa de ejemplo:");
    console.log(JSON.stringify(result.cargado));
    const periodos = await db.balanzaPnL.findMany({ where: { tenantId: result.tenantId }, distinct: ["anio", "periodo"], select: { anio: true, periodo: true } });
    console.log(`Periodos con balanza: ${periodos.length}`);
    console.log(`Empresas reales (antes → después): ${JSON.stringify(result.despuesReal)}`);
    console.log(`Personas con acceso a la empresa de ejemplo: ${result.accesos} (los accesos anteriores se conservaron).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
