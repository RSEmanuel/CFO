import { sendPasswordResetCode } from "@/auth/cognito";
import { isDevAuthBypassEnabled } from "@/auth/devAuth";
import { AppError } from "@/auth/errors";
import { jsonSuccess, toErrorResponse } from "@/auth/http";
import { forgotPasswordSchema } from "@/auth/schemas";
import { NextRequest } from "next/server";

/** Responde igual exista o no el correo, para no revelar qué cuentas hay. */
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
    const { email } = forgotPasswordSchema.parse(body);
    await sendPasswordResetCode(email);
    return jsonSuccess({ sent: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
