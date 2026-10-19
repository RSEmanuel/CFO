import { prisma } from "@/lib/prisma";

export type ClientRow = {
  id: string;
  name: string;
  rfc: string;
  /** Personas de esta empresa con acceso encendido (no cuenta al equipo de Cifra de otras empresas). */
  activeUsers: number;
  hasBalanza: boolean;
};

export async function listClients(): Promise<ClientRow[]> {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      rfc: true,
      _count: { select: { users: { where: { isActive: true } } } },
      balanzasPnL: { select: { id: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  return tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    rfc: tenant.rfc,
    activeUsers: tenant._count.users,
    hasBalanza: tenant.balanzasPnL.length > 0,
  }));
}
