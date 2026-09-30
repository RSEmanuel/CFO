import { AppError } from "@/auth/errors";
import { buildDevCognitoSub } from "@/auth/devAuth";
import type { PrismaClient } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import {
  DEMO_TENANT_RFC,
  EMPTY_COMPAC_TENANT,
  EMPTY_COMPAC_USERS,
  normalizeTenantRfc,
} from "@/services/tenants/constants";

async function createUserIfAbsent(
  client: PrismaClient,
  input: { email: string; role: UserRole; tenantId: string },
): Promise<"created" | "kept"> {
  const email = input.email.trim().toLowerCase();
  const existing = await client.user.findUnique({ where: { email } });
  if (existing) {
    return "kept";
  }
  await client.user.create({
    data: {
      email,
      cognitoSub: buildDevCognitoSub(email),
      role: input.role,
      tenantId: input.tenantId,
    },
  });
  return "created";
}

export async function ensureEmptyCompacWorkspace(
  client: PrismaClient,
  overrides: { name?: string; rfc?: string } = {},
): Promise<{
  tenant: { id: string; name: string; rfc: string };
  partner: "created" | "kept";
  viewer: "created" | "kept";
  ledger: { balanza: number; ventas: number; egresos: number; tesoreria: number };
}> {
  const name = (overrides.name ?? EMPTY_COMPAC_TENANT.name).trim();
  const rfc = normalizeTenantRfc(overrides.rfc ?? EMPTY_COMPAC_TENANT.rfc);
  if (rfc === DEMO_TENANT_RFC) {
    throw new AppError(
      "CONFLICT",
      "Ese RFC está reservado para la empresa demo CSI.",
      409,
    );
  }

  const tenant = await client.tenant.upsert({
    where: { rfc },
    update: { name },
    create: { name, rfc },
    select: { id: true, name: true, rfc: true },
  });

  const partner = await createUserIfAbsent(client, {
    email: EMPTY_COMPAC_USERS.partnerEmail,
    role: UserRole.CFO_PARTNER,
    tenantId: tenant.id,
  });
  const viewer = await createUserIfAbsent(client, {
    email: EMPTY_COMPAC_USERS.viewerEmail,
    role: UserRole.CLIENT_VIEWER,
    tenantId: tenant.id,
  });

  const [balanza, ventas, egresos, tesoreria] = await Promise.all([
    client.balanzaPnL.count({ where: { tenantId: tenant.id } }),
    client.auxiliarVentas.count({ where: { tenantId: tenant.id } }),
    client.auxiliarEgresos.count({ where: { tenantId: tenant.id } }),
    client.tesoreriaFlujo.count({ where: { tenantId: tenant.id } }),
  ]);

  return {
    tenant,
    partner,
    viewer,
    ledger: { balanza, ventas, egresos, tesoreria },
  };
}
