import { AppError } from "@/auth/errors";
import { changeCognitoUserRole, sendWelcomeCode, setCognitoUserEnabled } from "@/auth/cognito";
import { isDevAuthBypassEnabled } from "@/auth/devAuth";
import { assertCanChangeUser, canRegisterRole, type UserChange } from "@/auth/rbac";
import type { AdminAuditAction, UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const AUDIT_LIMIT = 50;

export type TenantUserRow = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};

export type AdminAuditRow = {
  id: string;
  action: AdminAuditAction;
  actorEmail: string;
  targetEmail: string;
  fromRole: UserRole | null;
  toRole: UserRole | null;
  createdAt: string;
};

export type TenantAccessView = {
  /** Personas dadas de alta en esta empresa. Se administran desde aquí. */
  members: TenantUserRow[];
  /** Administradores y socios de otras empresas: también pueden abrir esta. */
  portfolioStaff: Array<TenantUserRow & { homeTenantName: string }>;
  audit: AdminAuditRow[];
};

const USER_SELECT = { id: true, email: true, role: true, isActive: true, createdAt: true } as const;

function toRow(user: { id: string; email: string; role: UserRole; isActive: boolean; createdAt: Date }): TenantUserRow {
  return { ...user, createdAt: user.createdAt.toISOString() };
}

async function assertTenantExists(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }
}

export async function getTenantAccess(tenantId: string): Promise<TenantAccessView> {
  await assertTenantExists(tenantId);

  const [members, staff, audit] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: USER_SELECT,
      orderBy: [{ isActive: "desc" }, { email: "asc" }],
    }),
    prisma.user.findMany({
      where: { tenantId: { not: tenantId }, isActive: true, role: { in: ["ADMIN", "CFO_PARTNER"] } },
      select: { ...USER_SELECT, tenant: { select: { name: true } } },
      orderBy: { email: "asc" },
    }),
    prisma.adminAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: AUDIT_LIMIT,
    }),
  ]);

  return {
    members: members.map(toRow),
    portfolioStaff: staff.map(({ tenant, ...user }) => ({ ...toRow(user), homeTenantName: tenant.name })),
    audit: audit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorEmail: entry.actorEmail,
      targetEmail: entry.targetEmail,
      fromRole: entry.fromRole,
      toRole: entry.toRole,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

/**
 * Reenvía el correo de bienvenida (código para crear contraseña). Solo a alguien de la empresa
 * abierta, activo y que el actor podría haber dado de alta.
 */
export async function resendWelcomeEmail(input: {
  actor: { userId: string; role: UserRole };
  tenantId: string;
  userId: string;
}): Promise<{ welcomeEmail: "sent" | "skipped" }> {
  const target = await prisma.user.findFirst({
    where: { id: input.userId, tenantId: input.tenantId },
    select: USER_SELECT,
  });
  if (!target) {
    throw new AppError("NOT_FOUND", "Esa persona no pertenece a esta empresa.", 404);
  }
  if (target.id === input.actor.userId || !canRegisterRole(input.actor.role, target.role)) {
    throw new AppError("FORBIDDEN", "Tu rol no puede administrar a esta persona.", 403, { reason: "TARGET_ABOVE" });
  }
  if (!target.isActive) {
    throw new AppError("VALIDATION_ERROR", "Esa persona no tiene acceso activo.", 400, { reason: "inactiveUser" });
  }
  if (isDevAuthBypassEnabled()) {
    return { welcomeEmail: "skipped" };
  }
  await sendWelcomeCode(target.email);
  return { welcomeEmail: "sent" };
}

export async function changeTenantUser(input: {
  actor: { userId: string; email: string; role: UserRole };
  tenantId: string;
  userId: string;
  change: UserChange;
}): Promise<TenantUserRow> {
  // El usuario debe pertenecer a la empresa abierta: no se administra a nadie de otra empresa por id.
  const target = await prisma.user.findFirst({
    where: { id: input.userId, tenantId: input.tenantId },
    select: USER_SELECT,
  });
  if (!target) {
    throw new AppError("NOT_FOUND", "Esa persona no pertenece a esta empresa.", 404);
  }

  assertCanChangeUser(input.actor, target, input.change);

  const roleChanged = input.change.role !== undefined && input.change.role !== target.role;
  const accessChanged = input.change.isActive !== undefined && input.change.isActive !== target.isActive;
  if (!roleChanged && !accessChanged) {
    return toRow(target);
  }

  if (!isDevAuthBypassEnabled()) {
    if (accessChanged) {
      await setCognitoUserEnabled(target.email, input.change.isActive as boolean);
    }
    if (roleChanged) {
      await changeCognitoUserRole(target.email, target.role, input.change.role as UserRole);
    }
  }

  const auditBase = {
    tenantId: input.tenantId,
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    targetUserId: target.id,
    targetEmail: target.email,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(roleChanged ? { role: input.change.role } : {}),
        ...(accessChanged ? { isActive: input.change.isActive } : {}),
      },
      select: USER_SELECT,
    });
    if (roleChanged) {
      await tx.adminAuditLog.create({
        data: { ...auditBase, action: "ROLE_CHANGED", fromRole: target.role, toRole: user.role },
      });
    }
    if (accessChanged) {
      await tx.adminAuditLog.create({
        data: {
          ...auditBase,
          action: user.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
          fromRole: user.role,
        },
      });
    }
    return user;
  });

  return toRow(updated);
}
