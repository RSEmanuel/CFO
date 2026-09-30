/**
 * Verifica que el nuevo selectLeafCodes produzca EXACTAMENTE el mismo resultado
 * que la versión cuadrática original, y compara tiempos.
 * Uso: npx tsx scripts/perf-leaf-accounts.ts [tenantId]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { isAncestorAccount, selectLeafCodes } from "../src/services/ingest/leafAccounts";

/** Implementación original O(n²), solo para validar equivalencia. */
function selectLeafCodesQuadratic(codes: string[]): Set<string> {
  return new Set(codes.filter((code) => !codes.some((other) => isAncestorAccount(code, other))));
}

function assertEqualSets(a: Set<string>, b: Set<string>, label: string) {
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  if (onlyA.length > 0 || onlyB.length > 0) {
    console.error(`✗ ${label}: DIFEREN. solo-nueva=${onlyA.slice(0, 5)} solo-vieja=${onlyB.slice(0, 5)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${label}: idénticas (${a.size} hojas)`);
}

function randomCode(rng: () => number): string {
  const segments = 4;
  const parts: string[] = [];
  for (let i = 0; i < segments; i += 1) {
    parts.push(rng() < 0.35 ? "0000" : String(Math.floor(rng() * 9999)).padStart(4, "0"));
  }
  return parts.join("-");
}

async function main() {
  const tenantId = process.argv[2] ?? "cmtnpxzcm00003slj2os3og3p";

  // 1) Códigos reales del tenant (un mes con datos y el universo completo)
  const rows = await prisma.balanzaPnL.findMany({
    where: { tenantId },
    select: { idCuenta: true, anio: true, periodo: true },
  });
  const allCodes = [...new Set(rows.map((row) => row.idCuenta))];
  const monthRows = rows.filter((row) => row.anio === 2026 && row.periodo === 6);
  const monthCodes = [...new Set(monthRows.map((row) => row.idCuenta))];
  console.log(`Tenant ${tenantId}: ${allCodes.length} cuentas únicas totales, ${monthCodes.length} en 2026-06\n`);

  for (const [label, codes] of [
    ["mes 2026-06", monthCodes],
    ["universo completo", allCodes],
  ] as const) {
    let start = performance.now();
    const expected = selectLeafCodesQuadratic(codes);
    const quadMs = performance.now() - start;
    start = performance.now();
    const actual = selectLeafCodes(codes);
    const newMs = performance.now() - start;
    assertEqualSets(actual, expected, label);
    console.log(`  ${label}: cuadrática ${quadMs.toFixed(0)} ms → nueva ${newMs.toFixed(2)} ms`);
  }

  // 2) Fuzz: 200 listas aleatorias de códigos sintéticos
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let fuzzOk = true;
  for (let i = 0; i < 200; i += 1) {
    const codes = Array.from({ length: 40 + Math.floor(rng() * 60) }, () => randomCode(rng));
    const expected = selectLeafCodesQuadratic(codes);
    const actual = selectLeafCodes(codes);
    const same = codes.every((code) => expected.has(code) === actual.has(code));
    if (!same) {
      console.error(`✗ fuzz ${i}: diferencia detectada`);
      fuzzOk = false;
      break;
    }
  }
  console.log(fuzzOk ? "✓ fuzz: 200 listas aleatorias idénticas" : "✗ fuzz falló");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
