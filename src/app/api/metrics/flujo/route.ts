import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getFlujo } from "@/services/flujoService";

export const GET = withAuth(async (request, auth) => {
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  return jsonSuccess(await getFlujo(tenantId));
});
