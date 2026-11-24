import { AppError } from "@/auth/errors";
import type { AdminAuditAction, UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { loadStateFor, type LoadState } from "@/services/admin/loadStatus";

/** Cuántos movimientos recientes se muestran en "Qué pasó". */
export const ACTIVITY_LIMIT = 200;

export type UserActivity = {
  kind: "user";
  id: string;
  at: string;
  action: AdminAuditAction;
  actor: string;
  target: string;
  fromRole: UserRole | null;
  toRole: UserRole | null;
};

export type LoadActivity = {
  kind: "load";
  id: string;
  at: string;
  actor: string;
  fileName: string;
  periodo: number | null;
  anio: number | null;
  state: LoadState;
};

export type ActivityItem = UserActivity | LoadActivity;

export type ActivityFeedView = {
  items: ActivityItem[];
  truncated: boolean;
};

/** Junta dos listas ya ordenadas (más reciente primero) y corta en `limit`. */
export function mergeActivity(
  users: readonly UserActivity[],
  loads: readonly LoadActivity[],
  limit: number = ACTIVITY_LIMIT,
): ActivityFeedView {
  const all = [...users, ...loads].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  return { items: all.slice(0, limit), truncated: all.length > limit };
}

/**
 * Bitácora unificada de una empresa: altas, bajas y cambios de perfil (AdminAuditLog) más cada archivo
 * subido (IngestFileAudit). Solo lectura y siempre filtrada por tenantId: nunca mezcla empresas.
 */
export async function getActivityFeed(tenantId: string): Promise<ActivityFeedView> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  // Se pide uno de más en cada lista para saber si hay movimientos que ya no caben.
  const [audit, files] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_LIMIT + 1,
    }),
    prisma.ingestFileAudit.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_LIMIT + 1,
      select: {
        id: true,
        originalName: true,
        createdAt: true,
        periodo: true,
        anio: true,
        status: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  const users = audit.map(
    (entry): UserActivity => ({
      kind: "user",
      id: entry.id,
      at: entry.createdAt.toISOString(),
      action: entry.action,
      actor: entry.actorEmail,
      target: entry.targetEmail,
      fromRole: entry.fromRole,
      toRole: entry.toRole,
    }),
  );
  const loads = files.map(
    (file): LoadActivity => ({
      kind: "load",
      id: file.id,
      at: file.createdAt.toISOString(),
      actor: file.user.email,
      fileName: file.originalName,
      periodo: file.periodo,
      anio: file.anio,
      state: loadStateFor(file.status),
    }),
  );

  return mergeActivity(users, loads);
}
