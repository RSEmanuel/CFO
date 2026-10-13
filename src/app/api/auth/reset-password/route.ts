import { confirmPasswordReset } from "@/auth/cognito";
import { isDevAuthBypassEnabled } from "@/auth/devAuth";
import { AppError } from "@/auth/errors";
import { jsonSuccess, toErrorResponse } from "@/auth/http";
import { resetPasswordSchema } from "@/auth/schemas";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    if (isDevAuthBypassEnabled()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "En modo desarrollo no hay contraseña de Cognito que restablecer.",
        400,
        { reason: "devBypass" },
      );
    }
    const body: unknown = await request.json();
    const { email, code, newPassword } = resetPasswordSchema.parse(body);
    await confirmPasswordReset(email, code, newPassword);
    return jsonSuccess({ reset: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
