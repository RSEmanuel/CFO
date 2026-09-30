export type DevBypassLoginPlan = "inactive" | "keep" | "create";

/** Usuarios existentes conservan tenant y rol; uno nuevo se crea en el primer tenant disponible. */
export function planDevBypassLogin(existing: { isActive: boolean } | null): DevBypassLoginPlan {
  if (!existing) {
    return "create";
  }
  if (!existing.isActive) {
    return "inactive";
  }
  return "keep";
}
