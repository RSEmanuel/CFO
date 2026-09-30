import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { getHeroMetrics } from "@/services/metricsService";
import { withAuth } from "@/middleware/auth";

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  const periodo = Number(searchParams.get("periodo"));
  const anio = Number(searchParams.get("anio"));

  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);

  if (!Number.isInteger(periodo) || !Number.isInteger(anio)) {
    throw new AppError("VALIDATION_ERROR", "periodo y anio deben ser enteros.", 400);
  }

  const metrics = await getHeroMetrics(tenantId, periodo, anio);
  return jsonSuccess(metrics);
});
