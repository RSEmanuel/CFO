import { jsonSuccess } from "@/auth/http";
import { assertTenantAccess } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { getLedgerPeriods } from "@/services/ledgerPeriodService";

export const runtime = "nodejs";

export const GET = withAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;
  assertTenantAccess(auth, tenantId);
  return jsonSuccess(await getLedgerPeriods(tenantId));
});
