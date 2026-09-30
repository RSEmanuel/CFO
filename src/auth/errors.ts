export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "QUALITY_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "COGNITO_CHALLENGE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function unauthorized(message = "No autenticado."): AppError {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "No autorizado para este recurso."): AppError {
  return new AppError("FORBIDDEN", message, 403);
}
