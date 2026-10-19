import { AppError } from "@/auth/errors";
import { toErrorResponse } from "@/auth/http";
import { logError } from "@/services/errorLog";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

type ErrorScope = { tenantId?: string | null; userId?: string | null };

/**
 * Solo se registran fallas del servidor (5xx y excepciones no controladas). Los 4xx (validación,
 * permisos, sesión) son respuestas esperadas y llenarían el panel de ruido.
 */
function isServerFailure(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.status >= 500;
  }
  return !(error instanceof ZodError) && !(error instanceof SyntaxError);
}

/** Registra el error si es una falla del servidor y devuelve la respuesta de error de siempre. */
export async function handleApiError(error: unknown, request: NextRequest, scope: ErrorScope = {}) {
  if (isServerFailure(error)) {
    const err = error instanceof Error ? error : new Error(String(error));
    await logError({
      source: "server",
      severity: "error",
      message: err.message || err.name,
      stack: err.stack,
      url: `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`,
      userAgent: request.headers.get("user-agent"),
      tenantId: scope.tenantId,
      userId: scope.userId,
    });
  }
  return toErrorResponse(error);
}

type RouteHandler<C> = (request: NextRequest, context: C) => Promise<Response>;

/** Envuelve un handler de API sin sesión (las rutas con withAuth ya registran sus fallas). */
export function withErrorLog<C>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleApiError(error, request);
    }
  };
}
