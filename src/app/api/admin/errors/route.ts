import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { ERROR_VIEW_ROLES, resolveScopedTenantId } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { listErrors, logError, setErrorResolved } from "@/services/errorLog";
import { z } from "zod";

const reportSchema = z.object({
  source: z.enum(["client", "server"]).default("client"),
  message: z.string().min(1).max(5000),
  stack: z.string().max(50000).optional(),
  digest: z.string().max(1000).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(1000).optional(),
  severity: z.enum(["error", "warn"]).default("error"),
  /** Empresa que se estaba consultando; se valida contra el rol como en el resto del portal. */
  tenantId: z.string().min(1).optional(),
});

const listSchema = z.object({
  resolved: z.enum(["true", "false"]).optional(),
  source: z.enum(["client", "server"]).optional(),
  severity: z.enum(["error", "warn"]).optional(),
  tenantId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const patchSchema = z.object({
  id: z.string().min(1),
  resolved: z.boolean(),
});

/** Máximo de errores por usuario y minuto. En memoria por instancia: basta para frenar un bucle. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const recentReports = new Map<string, number[]>();

function allowReport(userId: string): boolean {
  const now = Date.now();
  const recent = (recentReports.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    recentReports.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentReports.set(userId, recent);
  return true;
}

/** Cualquier usuario con sesión reporta los errores de su navegador. */
export const POST = withAuth(async (request, auth) => {
  if (!allowReport(auth.userId)) {
    throw new AppError("CONFLICT", "Demasiados errores reportados; intenta en un minuto.", 429);
  }
  const payload = reportSchema.parse(await request.json());
  const tenantId = resolveScopedTenantId(auth, payload.tenantId);
  await logError({
    source: payload.source,
    severity: payload.severity,
    message: payload.message,
    stack: payload.stack,
    digest: payload.digest,
    url: payload.url,
    userAgent: payload.userAgent ?? request.headers.get("user-agent"),
    tenantId,
    userId: auth.userId,
  });
  return jsonSuccess({ logged: true }, 201);
});

export const GET = withAuth(
  async (request) => {
    const params = listSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonSuccess(
      await listErrors({
        resolved: params.resolved === undefined ? undefined : params.resolved === "true",
        source: params.source,
        severity: params.severity,
        tenantId: params.tenantId,
        q: params.q || undefined,
        from: params.from ? new Date(`${params.from}T00:00:00`) : undefined,
        to: params.to ? new Date(`${params.to}T23:59:59.999`) : undefined,
        page: params.page,
      }),
    );
  },
  { roles: ERROR_VIEW_ROLES },
);

export const PATCH = withAuth(
  async (request, auth) => {
    const payload = patchSchema.parse(await request.json());
    return jsonSuccess(await setErrorResolved(payload.id, payload.resolved, auth.email));
  },
  { roles: ERROR_VIEW_ROLES },
);
