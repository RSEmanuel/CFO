import { AppError } from "@/auth/errors";
import { UserRole } from "@/generated/prisma/enums";

export type AuthContext = {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string;
  cognitoSub: string;
  tokenUse: string;
};

const REGISTER_ROLES_BY_ACTOR: Record<UserRole, readonly UserRole[]> = {
  ADMIN: ["ADMIN", "CFO_PARTNER", "CLIENT_VIEWER"],
  CFO_PARTNER: ["CFO_PARTNER", "CLIENT_VIEWER"],
  CLIENT_VIEWER: [],
};

export function canRegisterRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return REGISTER_ROLES_BY_ACTOR[actorRole].includes(targetRole);
}

export function assertCanRegisterRole(actorRole: UserRole, targetRole: UserRole): void {
  if (!canRegisterRole(actorRole, targetRole)) {
    throw new AppError(
      "FORBIDDEN",
      "Tu rol no puede dar de alta usuarios con ese perfil.",
      403,
      { reason: "ROLE_NOT_ALLOWED" },
    );
  }
}

/**
 * CLIENT_VIEWER solo accede a su empresa. ADMIN y CFO_PARTNER ven todos los clientes.
 */
export function assertTenantAccess(auth: AuthContext, requestedTenantId: string): void {
  if (auth.role === "CLIENT_VIEWER" && auth.tenantId !== requestedTenantId) {
    throw new AppError(
      "FORBIDDEN",
      "Solo puedes consultar la información de tu propia empresa.",
      403,
    );
  }
}

export function resolveScopedTenantId(auth: AuthContext, requestedTenantId?: string): string {
  if (auth.role === "CLIENT_VIEWER") {
    if (requestedTenantId && requestedTenantId !== auth.tenantId) {
      throw new AppError(
        "FORBIDDEN",
        "Solo puedes consultar la información de tu propia empresa.",
        403,
      );
    }
    return auth.tenantId;
  }

  if (!requestedTenantId) {
    return auth.tenantId;
  }

  return requestedTenantId;
}

/** Roles que administran usuarios y consultan la bitácora de administración. */
export const USER_ADMIN_ROLES: readonly UserRole[] = ["ADMIN", "CFO_PARTNER"];

/** Mismos roles que Ingesta: quien sube archivos puede revisar el historial de cargas. */
export const INGEST_HISTORY_ROLES: readonly UserRole[] = ["ADMIN", "CFO_PARTNER"];

export function assertCanManageUsers(actorRole: UserRole): void {
  if (!USER_ADMIN_ROLES.includes(actorRole)) {
    throw new AppError("FORBIDDEN", "Tu rol no puede administrar usuarios.", 403);
  }
}

export function assertCanViewIngestHistory(actorRole: UserRole): void {
  if (!INGEST_HISTORY_ROLES.includes(actorRole)) {
    throw new AppError("FORBIDDEN", "Tu rol no puede consultar el historial de cargas.", 403);
  }
}

export type UserChangeReason = "SELF_CHANGE" | "TARGET_ABOVE" | "ROLE_NOT_ALLOWED";

export type UserChange = { isActive?: boolean; role?: UserRole };

/**
 * Valida un cambio de acceso o de rol sobre otro usuario.
 * - Nadie se quita el acceso ni se cambia el rol a sí mismo.
 * - Solo se administra a quien el actor podría haber dado de alta (un socio no toca a un admin).
 * - El rol nuevo también debe ser uno que el actor pueda otorgar.
 */
export function assertCanChangeUser(
  actor: { userId: string; role: UserRole },
  target: { id: string; role: UserRole },
  change: UserChange,
): void {
  const deny = (reason: UserChangeReason, message: string): never => {
    throw new AppError("FORBIDDEN", message, 403, { reason });
  };

  if (actor.userId === target.id) {
    deny("SELF_CHANGE", "No puedes cambiar tu propio acceso ni tu propio rol.");
  }
  if (!canRegisterRole(actor.role, target.role)) {
    deny("TARGET_ABOVE", "Tu rol no puede administrar a esta persona.");
  }
  if (change.role !== undefined && !canRegisterRole(actor.role, change.role)) {
    deny("ROLE_NOT_ALLOWED", "Tu rol no puede otorgar ese perfil.");
  }
}
