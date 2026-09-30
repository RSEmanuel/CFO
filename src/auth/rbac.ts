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
