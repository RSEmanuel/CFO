import { AppError } from "@/auth/errors";
import {
  adminCreateCognitoUser,
  disableCognitoUser,
  initiatePasswordLogin,
} from "@/auth/cognito";
import {
  buildDevAccessToken,
  buildDevCognitoSub,
  isDevAuthBypassEnabled,
} from "@/auth/devAuth";
import { verifyAccessToken } from "@/auth/jwt";
import { assertCanRegisterRole } from "@/auth/rbac";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";
import { planDevBypassLogin } from "@/auth/devBypass";

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
};

export type LoginResponse = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
};

function toPublicUser(user: {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    isActive: user.isActive,
  };
}

/**
 * Login de desarrollo: omite Cognito y resuelve el usuario por correo.
 * Usuarios existentes conservan tenant y rol. Un usuario nuevo cae en el
 * primer tenant disponible (el real tras el wipe, no el demo CSI).
 */
async function loginWithDevBypass(email: string): Promise<LoginResponse> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) {
    throw new AppError(
      "NOT_FOUND",
      "No hay empresas registradas. Ejecuta `npm run prisma:seed` antes de iniciar sesión.",
      404,
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const plan = planDevBypassLogin(existing);

  if (plan === "inactive") {
    throw new AppError("UNAUTHORIZED", "El usuario está desactivado.", 401);
  }

  const user =
    plan === "keep" && existing
      ? existing
      : await prisma.user.create({
          data: {
            email,
            cognitoSub: buildDevCognitoSub(email),
            role: UserRole.CFO_PARTNER,
            tenantId: tenant.id,
          },
        });

  const accessToken = buildDevAccessToken(user.cognitoSub);

  return {
    accessToken,
    idToken: accessToken,
    refreshToken: accessToken,
    expiresIn: 60 * 60 * 8,
    user: toPublicUser(user),
  };
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResponse> {
  if (isDevAuthBypassEnabled()) {
    return loginWithDevBypass(email);
  }

  const cognitoResult = await initiatePasswordLogin(email, password);

  if (cognitoResult.kind === "challenge") {
    throw new AppError(
      "COGNITO_CHALLENGE",
      "Cognito requiere un paso adicional para completar el inicio de sesión.",
      409,
      {
        challengeName: cognitoResult.challengeName,
        session: cognitoResult.session,
      },
    );
  }

  const payload = await verifyAccessToken(cognitoResult.accessToken);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ cognitoSub: payload.sub }, { email }],
    },
  });

  if (!user || !user.isActive) {
    throw new AppError("UNAUTHORIZED", "Correo o contraseña incorrectos.", 401);
  }

  return {
    accessToken: cognitoResult.accessToken,
    idToken: cognitoResult.idToken,
    refreshToken: cognitoResult.refreshToken,
    expiresIn: cognitoResult.expiresIn,
    user: toPublicUser(user),
  };
}

export async function registerUser(input: {
  actorRole: UserRole;
  email: string;
  password: string;
  role: UserRole;
  tenantId: string;
}): Promise<PublicUser> {
  assertCanRegisterRole(input.actorRole, input.role);

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
  });
  if (!tenant) {
    throw new AppError("NOT_FOUND", "La empresa (tenant) no existe.", 404);
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new AppError("CONFLICT", "Ya existe un usuario con ese correo.", 409);
  }

  if (isDevAuthBypassEnabled()) {
    const created = await prisma.user.create({
      data: {
        email: input.email,
        cognitoSub: buildDevCognitoSub(input.email),
        role: input.role,
        tenantId: input.tenantId,
      },
    });
    return toPublicUser(created);
  }

  const cognitoUser = await adminCreateCognitoUser({
    email: input.email,
    password: input.password,
    role: input.role,
    tenantId: input.tenantId,
  });

  try {
    const created = await prisma.user.create({
      data: {
        email: input.email,
        cognitoSub: cognitoUser.cognitoSub,
        role: input.role,
        tenantId: input.tenantId,
      },
    });
    return toPublicUser(created);
  } catch (error) {
    await disableCognitoUser(cognitoUser.username);
    throw error;
  }
}

export async function getMeByCognitoSub(cognitoSub: string) {
  const user = await prisma.user.findUnique({
    where: { cognitoSub },
    include: {
      tenant: {
        select: { id: true, name: true, rfc: true },
      },
    },
  });

  if (!user || !user.isActive) {
    throw new AppError("UNAUTHORIZED", "El usuario no está activo o no existe en el sistema.", 401);
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    isActive: user.isActive,
    tenant: user.tenant,
  };
}
