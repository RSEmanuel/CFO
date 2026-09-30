import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { getMetricsCatalog } from "@/services/metricsService";
import { withAuth } from "@/middleware/auth";

export const runtime = "nodejs";

function readInt(searchParams: URLSearchParams, keys: string[]): number {
  for (const key of keys) {
    const raw = searchParams.get(key);
    if (raw != null && raw !== "") {
      return Number(raw);
    }
  }
  return Number.NaN;
}

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  const periodo = readInt(searchParams, ["period", "periodo"]);
  const anio = readInt(searchParams, ["year", "anio"]);
  const comparableRaw = (searchParams.get("comparable") ?? "mom").toLowerCase();
  const comparable = comparableRaw === "yoy" ? "yoy" : "mom";

  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);

  if (!Number.isInteger(periodo) || !Number.isInteger(anio)) {
    throw new AppError("VALIDATION_ERROR", "year/period (o anio/periodo) deben ser enteros.", 400);
  }

  const catalog = await getMetricsCatalog(tenantId, periodo, anio, comparable);
  return jsonSuccess(catalog);
});
