import { jsonSuccess } from "@/auth/http";
import { assertCanManageUsers, resolveScopedTenantId, USER_ADMIN_ROLES } from "@/auth/rbac";
import { resendWelcomeSchema } from "@/auth/schemas";
import { withAuth } from "@/middleware/auth";
import { resendWelcomeEmail } from "@/services/admin/userAdmin";

/** Reenvía el correo de bienvenida con el código para crear contraseña. */
export const POST = withAuth(
  async (request, auth) => {
    assertCanManageUsers(auth.role);
    const payload = resendWelcomeSchema.parse(await request.json());
    const tenantId = resolveScopedTenantId(auth, payload.tenantId);
    return jsonSuccess(
      await resendWelcomeEmail({ actor: { userId: auth.userId, role: auth.role }, tenantId, userId: payload.userId }),
    );
  },
  { roles: USER_ADMIN_ROLES },
);
