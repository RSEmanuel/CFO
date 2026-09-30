import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getPolizasByAccount } from "@/services/polizasByAccountService";

export const runtime = "nodejs";

/**
 * GET /api/polizas/by-account?anio=2026&periodo=7&codigoCuenta=6101
 *
 * Drill-down de auditoría: movimientos de póliza de una cuenta o de sus
 * subcuentas (prefijo por segmentos; varios prefijos separados por coma).
 * El spec original pedía `companyId`; el proyecto usa `tenantId` y se
 * acepta `companyId` como alias.
 */
function parseRequiredInt(value: string | null, name: string, min: number, max: number): number {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El parámetro ${name} debe ser un entero entre ${min} y ${max}.`,
      400,
    );
  }
  return parsed;
}

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? params.get("companyId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const anio = parseRequiredInt(params.get("anio"), "anio", 2000, 2100);
  const periodo = parseRequiredInt(params.get("periodo"), "periodo", 1, 12);
  const codigoCuenta = params.get("codigoCuenta") ?? "";
  return jsonSuccess(await getPolizasByAccount(tenantId, anio, periodo, codigoCuenta));
});
