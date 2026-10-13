import { changeOwnCognitoPassword } from "@/auth/cognito";
import { isDevAuthBypassEnabled } from "@/auth/devAuth";
import { AppError } from "@/auth/errors";
import { jsonSuccess } from "@/auth/http";
import { extractBearerToken } from "@/auth/jwt";
import { changePasswordSchema } from "@/auth/schemas";
import { withAuth } from "@/middleware/auth";

export const POST = withAuth(async (request) => {
  if (isDevAuthBypassEnabled()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "En modo desarrollo no hay contraseña de Cognito que cambiar.",
      400,
      { reason: "devBypass" },
    );
  }

  const body: unknown = await request.json();
  const { currentPassword, newPassword } = changePasswordSchema.parse(body);
  // withAuth ya validó el token; Cognito lo necesita para identificar al usuario.
  const accessToken = extractBearerToken(request.headers.get("authorization"));
  await changeOwnCognitoPassword(accessToken, currentPassword, newPassword);
  return jsonSuccess({ changed: true });
});
