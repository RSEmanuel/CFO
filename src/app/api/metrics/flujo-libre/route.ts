import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getFlujoLibre } from "@/services/flujoLibreService";

export const GET = withAuth(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  const periodo = params.get("periodo") ?? "";
  return jsonSuccess(await getFlujoLibre(tenantId, periodo));
});
