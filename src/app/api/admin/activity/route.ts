import { jsonSuccess } from "@/auth/http";
import { assertCanManageUsers, resolveScopedTenantId, USER_ADMIN_ROLES } from "@/auth/rbac";
import { tenantQuerySchema } from "@/auth/schemas";
import { withAuth } from "@/middleware/auth";
import { getActivityFeed } from "@/services/admin/activityFeed";

/** "Qué pasó": solo el equipo (administrador y socio), acotado a la empresa pedida. */
export const GET = withAuth(
  async (request, auth) => {
    assertCanManageUsers(auth.role);
    const { tenantId } = tenantQuerySchema.parse({
      tenantId: request.nextUrl.searchParams.get("tenantId") ?? undefined,
    });
    const scopedTenantId = resolveScopedTenantId(auth, tenantId);
    return jsonSuccess(await getActivityFeed(scopedTenantId));
  },
  { roles: USER_ADMIN_ROLES },
);
