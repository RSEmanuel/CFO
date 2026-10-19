import { AppError } from "@/auth/errors";
import type { UserRole } from "@/generated/prisma/enums";
import { registerUser, type WelcomeEmailStatus } from "@/auth/service";
import { prisma } from "@/lib/prisma";
import { createEmptyTenant, type TenantSummary } from "@/services/tenants/tenantService";

/**
 * El dueño del cliente entra como CLIENT_VIEWER: ADMIN y CFO_PARTNER ven todas las empresas, así que
 * darle uno de esos roles abriría los datos de los demás clientes.
 */
export const OWNER_ROLE: UserRole = "CLIENT_VIEWER";

export type OnboardTenantResult = {
  tenant: TenantSummary;
  ownerEmail: string;
  ownerUserId: string;
  welcomeEmail: WelcomeEmailStatus;
  welcomeEmailSent: boolean;
};

/**
 * Alta de empresa nueva con su dueño: empresa, usuario (Cognito + Prisma) y correo de bienvenida.
 * Si el alta del usuario falla, la empresa se borra para no dejar una empresa sin dueño.
 * Si solo falla el correo, todo queda creado y se reenvía desde el portal.
 */
export async function onboardTenant(input: {
  actor: { userId: string; email: string; role: UserRole };
  name: string;
  rfc: string;
  ownerEmail: string;
  ownerName?: string;
}): Promise<OnboardTenantResult> {
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  // Se revisa antes de crear nada: así un correo repetido no deja una empresa a medias.
  if (await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } })) {
    throw new AppError("CONFLICT", "Ya existe un usuario con ese correo.", 409);
  }

  const tenant = await createEmptyTenant({ name: input.name, rfc: input.rfc });

  try {
    const owner = await registerUser({
      actor: input.actor,
      email: ownerEmail,
      name: input.ownerName,
      role: OWNER_ROLE,
      tenantId: tenant.id,
    });
    return {
      tenant,
      ownerEmail,
      ownerUserId: owner.id,
      welcomeEmail: owner.welcomeEmail,
      welcomeEmailSent: owner.welcomeEmail === "sent",
    };
  } catch (error) {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch((cleanupError: unknown) => {
      console.error("No se pudo deshacer la empresa tras fallar el alta del dueño", tenant.id, cleanupError);
    });
    throw error;
  }
}
