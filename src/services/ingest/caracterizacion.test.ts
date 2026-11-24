/**
 * Pruebas de caracterización ("fotos") de la ingesta.
 *
 * Congelan lo que hoy producen la detección y el mapeo para cada tipo de
 * documento, de modo que el cambio de motor (lectores por formato) pueda
 * demostrar que CONTPAQi y la plantilla de Cifra se leen exactamente igual.
 *
 * - Archivos sintéticos (siempre corren): la foto vive en
 *   fixtures/caracterizacion.snapshot.json y sí va en git (datos de ejemplo).
 * - Archivos reales de Data_ejemplo/ (solo si la carpeta existe): la foto vive
 *   en Data_ejemplo/.fotos-ingesta/, que NO va en git porque contiene cifras
 *   reales de clientes.
 *
 * Para tomar o actualizar fotos: ACTUALIZAR_FOTOS=1 npm run test:caracterizacion
 * Solo actualízalas cuando el cambio de resultado sea intencional.
 */
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseContpaqAuxiliares } from "@/lib/parsers/contpaq-auxiliares-parser";
import { parseContpaqPolizas } from "@/lib/parsers/contpaq-polizas-parser";
import { mapToMasterWorkbook } from "./applyMapping";
import { BUILTIN_PROFILES } from "./builtinProfiles";
import { detectDocument } from "./detectDocument";
import { FIXTURES_SINTETICOS } from "./fixtures/sinteticos";

const ACTUALIZAR = process.env.ACTUALIZAR_FOTOS === "1";
const SNAPSHOT_SINTETICOS = path.resolve("src/services/ingest/fixtures/caracterizacion.snapshot.json");
const DIR_REALES = path.resolve("Data_ejemplo");
const DIR_FOTOS_REALES = path.join(DIR_REALES, ".fotos-ingesta");

/** JSON estable: sin el id aleatorio de detección ni el hash del archivo
 * (ExcelJS sella la fecha de escritura dentro del ZIP). */
function canon(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, inner) => {
      if (key === "detectionId") return undefined;
      if (key === "sha256") return "<sha256>";
      return inner;
    }),
  );
}

async function fotografiar(buffer: Buffer, filename: string): Promise<unknown> {
  const detect = await detectDocument(buffer, filename, BUILTIN_PROFILES);
  const profile = detect.selectedProfileId
    ? BUILTIN_PROFILES.find((candidate) => candidate.id === detect.selectedProfileId) ?? null
    : null;
  const mapeo = detect.persistable
    ? await mapToMasterWorkbook({
        buffer,
        filename,
        documentType: detect.documentType,
        sourceSystem: detect.sourceSystem,
        sheetName: detect.sheetName,
        profile,
        periodo: detect.inferredPeriodo ?? 0,
        anio: detect.inferredAnio ?? 0,
      })
    : null;
  const cartera =
    detect.documentType === "auxiliar_cuentas" ? parseContpaqAuxiliares(buffer, { filename }) : null;
  const polizas =
    detect.documentType === "diarios_polizas" ? parseContpaqPolizas(buffer, { filename }) : null;
  return canon({ detect, mapeo, cartera, polizas });
}

function leerJson(file: string): unknown {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

function escribirJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("caracterización: archivos sintéticos se leen igual que en la foto", async () => {
  const actual: Record<string, unknown> = {};
  for (const fixture of FIXTURES_SINTETICOS) {
    actual[fixture.nombre] = await fotografiar(await fixture.build(), fixture.filename);
  }
  if (ACTUALIZAR) {
    escribirJson(SNAPSHOT_SINTETICOS, actual);
    return;
  }
  const esperado = leerJson(SNAPSHOT_SINTETICOS) as Record<string, unknown> | undefined;
  assert.ok(esperado, "Falta la foto; tómala con ACTUALIZAR_FOTOS=1 npm run test:caracterizacion");
  assert.deepEqual(Object.keys(actual), Object.keys(esperado));
  for (const nombre of Object.keys(esperado)) {
    assert.deepEqual(actual[nombre], esperado[nombre], `Cambió la lectura de "${nombre}"`);
  }
});

test("caracterización: los sintéticos cubren cada tipo de documento", async () => {
  const tipos = new Map<string, string>();
  for (const fixture of FIXTURES_SINTETICOS) {
    const detect = await detectDocument(await fixture.build(), fixture.filename, BUILTIN_PROFILES);
    tipos.set(fixture.nombre, `${detect.sourceSystem}/${detect.documentType}/${detect.persistable}`);
  }
  assert.deepEqual(Object.fromEntries(tipos), {
    "plantilla-master": "master_template/master_workbook/true",
    "compac-balanza": "compac/balanza/true",
    "compac-flujo": "compac/flujo_efectivo/true",
    "compac-auxiliar": "compac/auxiliar_cuentas/true",
    "compac-polizas": "compac/diarios_polizas/true",
    desconocido: "unknown/desconocido/false",
  });
});

const archivosReales = existsSync(DIR_REALES)
  ? readdirSync(DIR_REALES).filter((name) => /\.(xlsx|xlsm)$/i.test(name) && !name.startsWith("~$")).sort()
  : [];

test(
  "caracterización: archivos reales de Data_ejemplo se leen igual que en su foto",
  { skip: archivosReales.length === 0 ? "Data_ejemplo/ no está en esta máquina" : false },
  async () => {
    const sinFoto: string[] = [];
    for (const name of archivosReales) {
      const fotoFile = path.join(DIR_FOTOS_REALES, `${name}.json`);
      const actual = await fotografiar(readFileSync(path.join(DIR_REALES, name)), name);
      if (ACTUALIZAR) {
        escribirJson(fotoFile, actual);
        continue;
      }
      const esperado = leerJson(fotoFile);
      if (esperado === undefined) {
        sinFoto.push(name);
        continue;
      }
      assert.deepEqual(actual, esperado, `Cambió la lectura de "${name}"`);
    }
    assert.deepEqual(sinFoto, [], "Archivos sin foto; tómalas con ACTUALIZAR_FOTOS=1 antes de cambiar el motor");
  },
);
