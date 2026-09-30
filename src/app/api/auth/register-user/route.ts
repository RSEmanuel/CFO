import { jsonSuccess } from "@/auth/http";
import { registerUserSchema } from "@/auth/schemas";
import { registerUser } from "@/auth/service";
import { withAuth } from "@/middleware/auth";

export const POST = withAuth(
  async (request, auth) => {
    const body: unknown = await request.json();
    const payload = registerUserSchema.parse(body);
    const user = await registerUser({
      actorRole: auth.role,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      tenantId: payload.tenantId,
    });
    return jsonSuccess(user, 201);
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
