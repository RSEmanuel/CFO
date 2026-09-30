import { AppError } from "@/auth/errors";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEMO_TENANT_RFC, normalizeTenantRfc } from "@/services/tenants/constants";

export type TenantSummary = {
  id: string;
  name: string;
  rfc: string;
};

export async function createEmptyTenant(input: { name: string; rfc: string }): Promise<TenantSummary> {
  const name = input.name.trim();
  const rfc = normalizeTenantRfc(input.rfc);
  if (rfc === DEMO_TENANT_RFC) {
    throw new AppError(
      "CONFLICT",
      "Ese RFC está reservado para la empresa demo CSI. Usa otro RFC para la empresa vacía.",
      409,
    );
  }

  try {
    return await prisma.tenant.create({
      data: { name, rfc },
      select: { id: true, name: true, rfc: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "Ya existe una empresa con ese RFC.", 409);
    }
    throw error;
  }
}
