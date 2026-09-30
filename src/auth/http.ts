import { AppError } from "@/auth/errors";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function jsonSuccess<T>(data: T, status = 200): NextResponse<SuccessEnvelope<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse<ErrorEnvelope> {
  return NextResponse.json(
    {
      success: false,
      error: details ? { code, message, details } : { code, message },
    },
    { status },
  );
}

export function toErrorResponse(error: unknown): NextResponse<ErrorEnvelope> {
  if (error instanceof AppError) {
    return jsonError(error.code, error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return jsonError("VALIDATION_ERROR", "Los datos enviados no son válidos.", 400, {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (error instanceof SyntaxError) {
    return jsonError("VALIDATION_ERROR", "El cuerpo de la petición no es un JSON válido.", 400);
  }

  console.error("Error no controlado", error);
  return jsonError("INTERNAL_ERROR", "Ocurrió un error interno.", 500);
}
