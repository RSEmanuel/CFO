import { jsonSuccess } from "@/auth/http";
import { createTenantSchema } from "@/auth/schemas";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import { createEmptyTenant } from "@/services/tenants/tenantService";

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
  async (request) => {
    const body: unknown = await request.json();
    const payload = createTenantSchema.parse(body);
    const tenant = await createEmptyTenant(payload);
    return jsonSuccess(tenant, 201);
  },
  { roles: ["ADMIN", "CFO_PARTNER"] },
);
