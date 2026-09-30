import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getPosicionFinanciera } from "@/services/posicionFinancieraService";

export const runtime = "nodejs";

function readInt(searchParams: URLSearchParams, keys: string[]): number | null {
  for (const key of keys) {
    const raw = searchParams.get(key);
    if (raw != null && raw !== "") {
      return Number(raw);
    }
  }
  return null;
}

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  const year = readInt(searchParams, ["year", "anio"]);
  const period = readInt(searchParams, ["period", "periodo"]);

  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);

  if (year != null && !Number.isInteger(year)) {
    throw new AppError("VALIDATION_ERROR", "year (o anio) debe ser un entero.", 400);
  }
  if (period != null && !Number.isInteger(period)) {
    throw new AppError("VALIDATION_ERROR", "period (o periodo) debe ser un entero.", 400);
  }

  const payload = await getPosicionFinanciera(tenantId, year, period);
  return jsonSuccess(payload);
});
