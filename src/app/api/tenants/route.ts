import { jsonSuccess } from "@/auth/http";
import { onboardTenantSchema } from "@/auth/schemas";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import { onboardTenant } from "@/services/tenants/onboarding";

export const GET = withAuth(async (_request, auth) => {
  if (auth.role === "CLIENT_VIEWER") {
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { id: true, name: true, rfc: true },
    });
    return jsonSuccess(tenant ? [tenant] : []);
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, rfc: true },
    orderBy: { name: "asc" },
  });
  return jsonSuccess(tenants);
});

export const POST = withAuth(
  async (request, auth) => {
    const body: unknown = await request.json();
    const payload = onboardTenantSchema.parse(body);
    const result = await onboardTenant({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      ...payload,
    });
    return jsonSuccess(result, 201);
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
