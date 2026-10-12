import { jsonSuccess } from "@/auth/http";
import { assertCanViewIngestHistory, INGEST_HISTORY_ROLES, resolveScopedTenantId } from "@/auth/rbac";
import { tenantQuerySchema } from "@/auth/schemas";
import { withAuth } from "@/middleware/auth";
import { getLoadHistory } from "@/services/admin/ingestHistory";

export const GET = withAuth(
  async (request, auth) => {
    assertCanViewIngestHistory(auth.role);
    const { tenantId } = tenantQuerySchema.parse({
      tenantId: request.nextUrl.searchParams.get("tenantId") ?? undefined,
    });
    const scopedTenantId = resolveScopedTenantId(auth, tenantId);
    return jsonSuccess(await getLoadHistory(scopedTenantId));
  },
  { roles: INGEST_HISTORY_ROLES },
);
