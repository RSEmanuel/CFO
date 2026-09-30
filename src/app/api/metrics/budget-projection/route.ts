import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getBudgetProjection } from "@/services/budgetProjectionService";

export const runtime = "nodejs";

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  const periodo = searchParams.get("periodo");

  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);
  if (!periodo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "periodo debe tener formato YYYY-MM.",
      400,
    );
  }

  return jsonSuccess(await getBudgetProjection(tenantId, periodo));
});
