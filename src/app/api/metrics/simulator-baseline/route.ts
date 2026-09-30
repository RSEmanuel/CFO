import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getSimulatorBaseline } from "@/services/simulatorBaselineService";

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

  if (!tenantId) {
    throw new AppError("VALIDATION_ERROR", "El parámetro tenantId es obligatorio.", 400);
  }
  assertTenantAccess(auth, tenantId);

  if (!Number.isInteger(periodo) || !Number.isInteger(anio)) {
    throw new AppError("VALIDATION_ERROR", "year/period (o anio/periodo) deben ser enteros.", 400);
  }

  return jsonSuccess(await getSimulatorBaseline(tenantId, anio, periodo));
});
