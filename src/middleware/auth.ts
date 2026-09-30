import { UserRole } from "@/generated/prisma/enums";
import { forbidden, unauthorized } from "@/auth/errors";
import { toErrorResponse } from "@/auth/http";
import { extractBearerToken, verifyAccessToken } from "@/auth/jwt";
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

      const auth: AuthContext = {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        cognitoSub: user.cognitoSub,
        tokenUse: payload.token_use,
      };

      return await handler(request, auth, routeContext);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
