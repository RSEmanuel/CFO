import { jsonSuccess } from "@/auth/http";
import { assertCanManageUsers, resolveScopedTenantId, USER_ADMIN_ROLES } from "@/auth/rbac";
import { changeUserSchema, tenantQuerySchema } from "@/auth/schemas";
import { withAuth } from "@/middleware/auth";
import { changeTenantUser, getTenantAccess } from "@/services/admin/userAdmin";

// Las altas siguen entrando por POST /api/auth/register-user (Cognito + bitácora).

export const GET = withAuth(
  async (request, auth) => {
    assertCanManageUsers(auth.role);
    const { tenantId } = tenantQuerySchema.parse({
      tenantId: request.nextUrl.searchParams.get("tenantId") ?? undefined,
    });
    const scopedTenantId = resolveScopedTenantId(auth, tenantId);
    return jsonSuccess(await getTenantAccess(scopedTenantId));
  },
  { roles: USER_ADMIN_ROLES },
);

export const PATCH = withAuth(
  async (request, auth) => {
    assertCanManageUsers(auth.role);
    const body: unknown = await request.json();
    const payload = changeUserSchema.parse(body);
    const scopedTenantId = resolveScopedTenantId(auth, payload.tenantId);
    const user = await changeTenantUser({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      tenantId: scopedTenantId,
      userId: payload.userId,
      change: { isActive: payload.isActive, role: payload.role },
    });
    return jsonSuccess(user);
  },
  { roles: USER_ADMIN_ROLES },
);
