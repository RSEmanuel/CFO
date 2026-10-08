import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { cachedForTenant } from "@/lib/serverCache";
import { withAuth } from "@/middleware/auth";
import { getResultadosTop5 } from "@/services/resultadosTop5Service";

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const periodo = params.get("periodo") ?? "";
  const moneda = params.get("moneda") ?? "MXN";
  return jsonSuccess(
    await cachedForTenant(tenantId, `resultados-top5|${periodo}|${moneda}`, () =>
      getResultadosTop5(tenantId, periodo, moneda),
    ),
  );
});
