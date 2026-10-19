import { UserRole } from "@/generated/prisma/enums";
import { forbidden, unauthorized } from "@/auth/errors";
import { extractBearerToken, verifyAccessToken } from "@/auth/jwt";
import { handleApiError } from "@/lib/api-error-handler";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/auth/rbac";
import { NextRequest } from "next/server";

export type { AuthContext };

type RouteContext = { params?: Promise<Record<string, string>> | Record<string, string> };

export type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext,
  routeContext?: RouteContext,
) => Promise<Response>;

type WithAuthOptions = {
  roles?: readonly UserRole[];
};

export function withAuth(handler: AuthenticatedHandler, options: WithAuthOptions = {}) {
  return async (request: NextRequest, routeContext?: RouteContext): Promise<Response> => {
    let auth: AuthContext | null = null;
    try {
      const token = extractBearerToken(request.headers.get("authorization"));
      const payload = await verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { cognitoSub: payload.sub },
      });

      if (!user || !user.isActive) {
        throw unauthorized("El usuario no está activo o no existe en el sistema.");
      }

      if (options.roles && !options.roles.includes(user.role)) {
        throw forbidden("Tu rol no tiene permiso para esta operación.");
      }

      auth = {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        cognitoSub: user.cognitoSub,
        tokenUse: payload.token_use,
      };

      return await handler(request, auth, routeContext);
    } catch (error) {
      // Las fallas del servidor quedan en el panel de errores con la empresa y el usuario de la sesión.
      // Se atribuye a la empresa consultada (?tenantId=) y, si no viene, a la de la sesión.
      return handleApiError(error, request, {
        tenantId: auth ? (request.nextUrl.searchParams.get("tenantId") ?? auth.tenantId) : null,
        userId: auth?.userId,
      });
    }
  };
}
