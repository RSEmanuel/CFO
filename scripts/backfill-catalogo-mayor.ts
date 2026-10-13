import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { mapToMasterWorkbook } from "../src/services/ingest/applyMapping";
import { COMPAC_BALANZA_PROFILE } from "../src/services/ingest/builtinProfiles";
import { catalogoPendiente } from "../src/services/ingest/catalogoPendiente";
import { isMayorCode } from "../src/services/posicionFinanciera";

/**
 * Completa los nombres de cuenta de mayor (cuentas_catalogo) de una empresa a
 * partir de una balanza Compac, sin volver a cargar la balanza. Sirve para
 * empresas cuya balanza se cargó antes de que existiera el catálogo: su Estado
 * de resultados muestra «Cuenta de mayor 6101» en lugar del nombre real.
 *
 * Solo toca cuentas_catalogo de ese tenant: no borra ni cambia montos. Usa el
 * mismo parser que la ingesta del portal, así que el nombre es exactamente el
 * de la fila de mayor del archivo; nunca el de una subcuenta.
 *
 * Idempotente: sin --apply solo muestra lo que cambiaría; con --apply guarda
 * únicamente los nombres faltantes o distintos. Una segunda corrida no cambia nada.
 *
 * Uso:
 *   npx tsx scripts/backfill-catalogo-mayor.ts --rfc <RFC> --file <balanza.xlsx> [--apply]
 *
 * Apunta a la base de DATABASE_URL (por defecto la local de .env).
 */

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const rfc = argValue("--rfc");
  const file = argValue("--file");
  const apply = process.argv.includes("--apply");
  if (!rfc || !file) {
    throw new Error("Uso: --rfc <RFC> --file <balanza.xlsx> [--apply]");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { rfc } });
    if (!tenant) {
      throw new Error(`No existe una empresa con RFC ${rfc}.`);
    }
    console.log(`Base: ${new URL(connectionString).host}`);
    console.log(`Empresa: ${tenant.name} (${tenant.id})`);

    // El periodo no importa: del archivo solo se usan los nombres, no los montos.
    const { workbook } = await mapToMasterWorkbook({
      buffer: readFileSync(file),
      filename: basename(file),
      documentType: "balanza",
      sourceSystem: "COMPAC",
      sheetName: null,
      profile: COMPAC_BALANZA_PROFILE,
      periodo: 1,
      anio: 2000,
    });
    const delArchivo = workbook.cuentasCatalogo ?? [];
    if (delArchivo.length === 0) {
      throw new Error("El archivo no trae filas de cuenta de mayor con nombre. Revisa que sea la balanza completa de Compac.");
    }

    const guardado = await prisma.cuentaCatalogo.findMany({
      where: { tenantId: tenant.id, idCuenta: { in: delArchivo.map((fila) => fila.idCuenta) } },
      select: { idCuenta: true, nombreCuenta: true },
    });
    const pendientes = catalogoPendiente(delArchivo, guardado);
    const mayores = pendientes.filter((fila) => isMayorCode(fila.idCuenta)).length;
    console.log(`Nombres en el archivo: ${delArchivo.length} · ya guardados igual: ${delArchivo.length - pendientes.length}`);
    console.log(`Por guardar: ${pendientes.length} (${mayores} de cuentas de mayor)`);
    for (const fila of pendientes) {
      console.log(`  ${fila.idCuenta}  ${fila.nombreCuenta}`);
    }

    if (pendientes.length === 0) {
      console.log("Nada que hacer: el catálogo ya está completo.");
      return;
    }
    if (!apply) {
      console.log("\nModo prueba: no se guardó nada. Vuelve a correr con --apply para guardar.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const fila of pendientes) {
        await tx.cuentaCatalogo.upsert({
          where: { tenantId_idCuenta: { tenantId: tenant.id, idCuenta: fila.idCuenta } },
          create: { tenantId: tenant.id, idCuenta: fila.idCuenta, nombreCuenta: fila.nombreCuenta },
          update: { nombreCuenta: fila.nombreCuenta },
        });
      }
    });
    console.log(`\nGuardados ${pendientes.length} nombres.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
