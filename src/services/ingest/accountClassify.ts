import type { CategoriaMaestra } from "@/generated/prisma/enums";
import { accountPrefix, normalizeText } from "@/services/metricsLedger";
import type { AccountPrefixRules } from "@/services/ingest/types";

const FALLBACK: Record<number, CategoriaMaestra> = {
  1: "Activo",
  2: "Pasivo",
  3: "Patrimonio",
  4: "Ingreso",
  5: "COGS",
  6: "OpEx",
  7: "Ingreso",
  8: "OpEx",
};

/** PyG = primer dígito 4–8; 1xxx/2xxx/3xxx son balance y nunca se reclasifican por nombre. */
function isPnlAccount(idCuenta: string): boolean {
  return ["4", "5", "6", "7", "8"].includes(idCuenta.replace(/\D/g, "").slice(0, 1));
}

export function classifyCategoria(
  idCuenta: string,
  nombreCuenta: string,
  rules: AccountPrefixRules | null,
): CategoriaMaestra {
  // Las excepciones por nombre (p. ej. "depreciacion|amortizacion" → OpEx) solo
  // aplican a cuentas de PyG: 1200/1202 son contra-activo (dep. acumulada) y
  // deben quedar como Activo aunque el nombre diga "depreciación".
  if (isPnlAccount(idCuenta)) {
    const name = normalizeText(nombreCuenta);
    for (const exception of rules?.nameExceptions ?? []) {
      if (new RegExp(exception.pattern, "i").test(name)) {
        return exception.categoria;
      }
    }
  }
  const first = idCuenta.replace(/\D/g, "").slice(0, 1);
  const fromRules = rules?.byPrefix?.[first];
  if (fromRules) {
    return fromRules;
  }
  const two = accountPrefix(idCuenta);
  const bucket = Math.floor(two / 10) || Number(first);
  return FALLBACK[bucket] ?? "OpEx";
}

export function isDepreciation(nombreCuenta: string, idCuenta: string): boolean {
  // El flag D&A alimenta el EBITDA del PyG; una cuenta de balance (1200/1202)
  // con "depreciación" en el nombre no es gasto del periodo.
  if (!isPnlAccount(idCuenta)) {
    return false;
  }
  return /depreciacion|amortizacion/.test(normalizeText(`${idCuenta} ${nombreCuenta}`));
}
