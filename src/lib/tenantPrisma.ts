import { prisma } from "@/lib/prisma";

/**
 * Devuelve un cliente Prisma con filtro obligatorio por empresa activa.
 */
export function getTenantClient(tenantId: string) {
  return {
    tenantId,
    prisma,
    whereTenant: { tenantId },
  };
}
