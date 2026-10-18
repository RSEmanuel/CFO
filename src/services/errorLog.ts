import { AppError } from "@/auth/errors";
import type { AppErrorSeverity, AppErrorSource } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const ERROR_LOG_PAGE_SIZE = 50;

/** Topes de tamaño para que un error con stack enorme no infle la tabla. */
const MAX_MESSAGE = 2000;
const MAX_STACK = 20000;
const MAX_FIELD = 1000;

export type LogErrorInput = {
  source: AppErrorSource;
  message: string;
  stack?: string | null;
  digest?: string | null;
  url?: string | null;
  userAgent?: string | null;
  severity?: AppErrorSeverity;
  tenantId?: string | null;
  userId?: string | null;
};

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) {
    return null;
  }
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Guarda un error del portal. Nunca lanza: si la base falla, registrar el error no debe tumbar la
 * respuesta que ya está fallando; solo queda en la consola del servidor.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    // La empresa puede venir de la URL (?tenantId=): si no existe, el error se guarda sin empresa
    // en lugar de perderse por la llave foránea.
    const tenantId =
      input.tenantId && (await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } }))
        ? input.tenantId
        : null;
    await prisma.appErrorLog.create({
      data: {
        source: input.source,
        severity: input.severity ?? "error",
        message: clip(input.message, MAX_MESSAGE) ?? "(sin mensaje)",
        stack: clip(input.stack, MAX_STACK),
        digest: clip(input.digest, MAX_FIELD),
        url: clip(input.url, MAX_FIELD),
        userAgent: clip(input.userAgent, MAX_FIELD),
        tenantId,
        userId: input.userId ?? null,
      },
    });
  } catch (error) {
    console.error("No se pudo registrar el error en app_error_logs", error);
  }
}

export type ErrorLogFilters = {
  resolved?: boolean;
  source?: AppErrorSource;
  severity?: AppErrorSeverity;
  tenantId?: string;
  q?: string;
  from?: Date;
  to?: Date;
  page: number;
};

export type ErrorLogRow = {
  id: string;
  createdAt: string;
  source: AppErrorSource;
  severity: AppErrorSeverity;
  message: string;
  stack: string | null;
  digest: string | null;
  url: string | null;
  userAgent: string | null;
  tenantId: string | null;
  tenantName: string | null;
  userEmail: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export type ErrorLogView = {
  rows: ErrorLogRow[];
  page: number;
  pageSize: number;
  /** Total con los filtros aplicados (el "total del periodo"). */
  total: number;
  /** Con los mismos filtros de empresa/origen/severidad/texto, sin el de estado. */
  last24h: number;
  unresolved: number;
};

export async function listErrors(filters: ErrorLogFilters): Promise<ErrorLogView> {
  const base: Prisma.AppErrorLogWhereInput = {
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.q ? { message: { contains: filters.q, mode: "insensitive" as const } } : {}),
  };
  const dateRange: Prisma.AppErrorLogWhereInput =
    filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {};
  const where: Prisma.AppErrorLogWhereInput = {
    ...base,
    ...dateRange,
    ...(filters.resolved === undefined ? {} : { resolved: filters.resolved }),
  };
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [rows, total, last24h, unresolved] = await Promise.all([
    prisma.appErrorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * ERROR_LOG_PAGE_SIZE,
      take: ERROR_LOG_PAGE_SIZE,
      include: { tenant: { select: { name: true } }, user: { select: { email: true } } },
    }),
    prisma.appErrorLog.count({ where }),
    prisma.appErrorLog.count({ where: { ...base, createdAt: { gte: since24h } } }),
    prisma.appErrorLog.count({ where: { ...base, ...dateRange, resolved: false } }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      source: row.source,
      severity: row.severity,
      message: row.message,
      stack: row.stack,
      digest: row.digest,
      url: row.url,
      userAgent: row.userAgent,
      tenantId: row.tenantId,
      tenantName: row.tenant?.name ?? null,
      userEmail: row.user?.email ?? null,
      resolved: row.resolved,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
    page: filters.page,
    pageSize: ERROR_LOG_PAGE_SIZE,
    total,
    last24h,
    unresolved,
  };
}

export async function setErrorResolved(id: string, resolved: boolean, actorEmail: string) {
  const exists = await prisma.appErrorLog.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw new AppError("NOT_FOUND", "Ese error ya no existe.", 404);
  }
  return prisma.appErrorLog.update({
    where: { id },
    data: resolved
      ? { resolved: true, resolvedBy: actorEmail, resolvedAt: new Date() }
      : { resolved: false, resolvedBy: null, resolvedAt: null },
    select: { id: true, resolved: true, resolvedBy: true, resolvedAt: true },
  });
}
