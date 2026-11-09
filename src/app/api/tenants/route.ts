import { jsonSuccess } from "@/auth/http";
import { viewerTenantIds } from "@/auth/rbac";
import { onboardTenantSchema } from "@/auth/schemas";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import { onboardTenant } from "@/services/tenants/onboarding";

export const GET = withAuth(async (_request, auth) => {
  if (auth.role === "CLIENT_VIEWER") {
    // Su empresa y, solo si se le concedieron, las extra. Su empresa va primero.
    const allowed = viewerTenantIds(auth) ?? [auth.tenantId];
    const found = await prisma.tenant.findMany({
      where: { id: { in: [...allowed] } },
      select: { id: true, name: true, rfc: true },
    });
    return jsonSuccess(allowed.flatMap((id) => found.filter((tenant) => tenant.id === id)));
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
