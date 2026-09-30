import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getFlujoOperativo } from "@/services/flujoOperativoService";

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const periodo = params.get("periodo") ?? "";
  const moneda = params.get("moneda") ?? "MXN";
  return jsonSuccess(await getFlujoOperativo(tenantId, periodo, moneda));
});
