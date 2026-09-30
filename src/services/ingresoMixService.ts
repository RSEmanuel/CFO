import { DEFAULT_ACCOUNT_ROLES } from "@/services/ingest/accountRoles";
import { listEffectiveProfiles } from "@/services/ingest/profileStore";
import type { AccountRoles } from "@/services/ingest/types";

// Prioridad: perfil TENANT de balanza con roles → builtin balanza con roles →
// DEFAULT_ACCOUNT_ROLES (convención Compac/SAT) para perfiles sembrados antes
// de que existiera el campo.
export async function resolveAccountRoles(tenantId: string): Promise<AccountRoles> {
  const profiles = await listEffectiveProfiles(tenantId);
  const balanzaConRoles = profiles.filter(
    (profile) => profile.documentType === "balanza" && profile.accountRoles,
  );
  const efectivo =
    balanzaConRoles.find((profile) => profile.origin === "TENANT") ?? balanzaConRoles[0];
  return efectivo?.accountRoles ?? DEFAULT_ACCOUNT_ROLES;
}
