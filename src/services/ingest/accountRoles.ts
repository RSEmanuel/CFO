import { COMPAC_ACCOUNT_ROLES } from "@/services/ingest/builtinProfiles";
import { normalizeToken } from "@/services/ingest/cells";
import { isAncestorAccount, selectLeafCodes } from "@/services/ingest/leafAccounts";
import type { AccountRoleRule, AccountRoles } from "@/services/ingest/types";

// Fallback cuando el perfil efectivo no define roles (p. ej. builtins sembrados
// antes de que existiera el campo). Los tenants pueden sobreescribirlo vía perfil.
export const DEFAULT_ACCOUNT_ROLES: AccountRoles = COMPAC_ACCOUNT_ROLES;

export type CuentaRow = {
  idCuenta: string;
  nombreCuenta: string;
};

function digitsOf(codigo: string): string {
  return codigo.replace(/\D/g, "");
}

export function matchesRole(rule: AccountRoleRule, codigo: string, nombre: string): boolean {
  const digits = digitsOf(codigo);
  if (rule.prefixes.some((prefix) => digits.startsWith(digitsOf(prefix)))) {
    return true;
  }
  const normalizedName = normalizeToken(nombre);
  return (rule.nameTokens ?? []).some((token) => normalizedName.includes(normalizeToken(token)));
}

function matchesByPrefix(rule: AccountRoleRule, codigo: string): boolean {
  const digits = digitsOf(codigo);
  return rule.prefixes.some((prefix) => digits.startsWith(digitsOf(prefix)));
}

// Resuelve las hojas de un rol (p. ej. clientes) sobre las filas de la balanza.
// Cubre ambos mundos: perfiles que persisten padres (master template) y
// perfiles leafOnly (Compac) donde solo hay hojas.
export function findRoleLeaves<T extends CuentaRow>(rows: T[], rule: AccountRoleRule): T[] {
  const leafSet = selectLeafCodes(rows.map((row) => row.idCuenta));
  const leaves = rows.filter((row) => leafSet.has(row.idCuenta));
  const parents = rows.filter((row) => !leafSet.has(row.idCuenta));

  if (parents.length > 0) {
    // Prioridad: (a) prefix match configurable; (b) nombre exacto ("clientes"
    // preferido sobre "clientes diversos"); (c) cualquier nameToken.
    const prefixParents = parents.filter((row) => matchesByPrefix(rule, row.idCuenta));
    const tokenParents = parents.filter((row) =>
      (rule.nameTokens ?? []).some((token) => normalizeToken(row.nombreCuenta).includes(normalizeToken(token))),
    );
    const exactParents = tokenParents.filter((row) =>
      (rule.nameTokens ?? []).some((token) => normalizeToken(row.nombreCuenta) === normalizeToken(token)),
    );
    const chosen =
      prefixParents.length > 0 ? prefixParents : exactParents.length > 0 ? exactParents : tokenParents;
    if (chosen.length > 0) {
      const parentCodes = chosen.map((row) => row.idCuenta);
      const bajoPadre = leaves.filter((leaf) =>
        parentCodes.some((parent) => isAncestorAccount(parent, leaf.idCuenta)),
      );
      if (bajoPadre.length > 0) {
        return bajoPadre;
      }
    }
  }

  // Sin padres persistidos (leafOnly): las hojas matchean el rol directamente.
  return leaves.filter((leaf) => matchesRole(rule, leaf.idCuenta, leaf.nombreCuenta));
}
