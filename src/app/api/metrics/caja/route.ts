import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getCajaRespiro } from "@/services/cajaService";

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const periodo = params.get("periodo") ?? "";
  return jsonSuccess(await getCajaRespiro(tenantId, periodo));
});
