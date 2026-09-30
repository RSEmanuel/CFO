import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getCobranza } from "@/services/cobranzaService";

export const GET = withAuth(async (request, auth) => {
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  return jsonSuccess(await getCobranza(tenantId));
});
