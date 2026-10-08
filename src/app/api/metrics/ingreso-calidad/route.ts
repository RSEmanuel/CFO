import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { cachedForTenant } from "@/lib/serverCache";
import { withAuth } from "@/middleware/auth";
import { getIngresoCalidad } from "@/services/ingresoCalidadService";

export const runtime = "nodejs";

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const periodo = params.get("periodo") ?? "";
  return jsonSuccess(
    await cachedForTenant(tenantId, `ingreso-calidad|${periodo}`, () => getIngresoCalidad(tenantId, periodo)),
  );
});
