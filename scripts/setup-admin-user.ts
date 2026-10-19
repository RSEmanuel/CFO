import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AdminAuditAction, PrismaClient, UserRole } from "../src/generated/prisma/client";
import { buildDevCognitoSub } from "../src/auth/devAuth";
import { EMPTY_COMPAC_TENANT } from "../src/services/tenants/constants";

/**
 * Deja un usuario como superadministrador interno (rol ADMIN), activo.
 * Si no existe lo crea en el tenant Compac (o el primero disponible) con el
 * cognitoSub de desarrollo; si existe, conserva su tenant y su cognitoSub.
 *
 * Uso: npx tsx scripts/setup-admin-user.ts [--email correo]
 */
const DEFAULT_ADMIN_EMAIL = "emanuel2698@hotmail.com";
const SCRIPT_ACTOR = "script:setup-admin-user";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const email = (argValue("--email") ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const tenant =
      (await prisma.tenant.findUnique({ where: { rfc: EMPTY_COMPAC_TENANT.rfc } })) ??
      (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!tenant) {
      throw new Error("No hay empresas registradas. Crea un tenant antes de dar de alta al admin.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    const user = await prisma.$transaction(async (tx) => {
      if (!existing) {
        const created = await tx.user.create({
          data: {
            email,
            cognitoSub: buildDevCognitoSub(email),
            role: UserRole.ADMIN,
            isActive: true,
            tenantId: tenant.id,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            tenantId: created.tenantId,
            action: AdminAuditAction.USER_CREATED,
            actorUserId: SCRIPT_ACTOR,
            actorEmail: SCRIPT_ACTOR,
            targetUserId: created.id,
            targetEmail: created.email,
            toRole: created.role,
          },
        });
        return created;
      }

      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { role: UserRole.ADMIN, isActive: true },
      });
      const audit = { tenantId: updated.tenantId, actorUserId: SCRIPT_ACTOR, actorEmail: SCRIPT_ACTOR, targetUserId: updated.id, targetEmail: updated.email };
      if (existing.role !== UserRole.ADMIN) {
        await tx.adminAuditLog.create({
          data: { ...audit, action: AdminAuditAction.ROLE_CHANGED, fromRole: existing.role, toRole: updated.role },
        });
      }
      if (!existing.isActive) {
        await tx.adminAuditLog.create({ data: { ...audit, action: AdminAuditAction.USER_REACTIVATED } });
      }
      return updated;
    });

    console.log(existing ? "Usuario existente actualizado a ADMIN." : "Usuario ADMIN creado.");
    console.log(`userId=${user.id}`);
    console.log(`email=${user.email}`);
    console.log(`role=${user.role} isActive=${user.isActive}`);
    console.log(`cognitoSub=${user.cognitoSub}`);
    console.log(`tenantId=${user.tenantId}`);
    if (existing) {
      console.log(`antes: role=${existing.role} isActive=${existing.isActive}`);
    } else {
      console.log(`tenant=${tenant.name} (${tenant.rfc})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
