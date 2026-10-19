# Correo de bienvenida (alta de usuarios)

Al dar de alta a alguien en **Configuración → Usuarios**, Cifra ya no muestra una contraseña temporal.
Cognito le manda a la persona un correo con un código de 6 dígitos y un enlace a
`https://app.cfocifra.com/set-password`. Ahí escribe su correo, el código y su contraseña dos veces,
y después entra por `/login`.

## Cómo funciona por dentro

1. `adminCreateCognitoUser` (`src/auth/cognito.ts`) crea al usuario con `MessageAction: SUPPRESS`
   (Cognito no manda su invitación con contraseña temporal) y le pone una contraseña interna aleatoria
   permanente que nadie conoce. Así el usuario queda **CONFIRMED**.
   - Por qué no se quita `SUPPRESS`: un usuario creado sin contraseña queda en `FORCE_CHANGE_PASSWORD`,
     y en ese estado Cognito rechaza `ForgotPassword` ("User password cannot be reset in the current state").
2. Ya guardado en la base, `registerUser` (`src/auth/service.ts`) llama a `sendWelcomeCode`, que es un
   `ForgotPassword` con `ClientMetadata: { flow: "welcome" }`. Cognito manda el **mensaje de verificación**.
3. La persona abre `/set-password?code=######` (el código llega prellenado desde el enlace), escribe su
   correo y su contraseña; el portal llama a `/api/auth/reset-password` (`ConfirmForgotPassword`).
4. Si el correo no salió, la pantalla de Usuarios lo dice y ofrece **Reenviar correo**
   (`POST /api/admin/users/welcome`).

## Plantilla en la consola de AWS (no vive en el repo)

El correo de bienvenida y el de "olvidé mi contraseña" usan la **misma plantilla** de Cognito
(mensaje de verificación). Por eso el texto de abajo sirve para los dos casos.

Ruta: **Amazon Cognito → User pools → (pool de Cifra) → Messaging → Message templates →
Verification message → Edit**.

- **Verification type:** Code
- **Email subject:**

```
Cifra: establece tu contraseña
```

- **Email message** (HTML; debe incluir `{####}`, que Cognito sustituye por el código):

```html
<div style="font-family:Arial,Helvetica,sans-serif;color:#101425;max-width:520px;margin:0 auto;padding:24px;">
  <p style="font-size:18px;font-weight:bold;margin:0 0 16px;">Bienvenido a Cifra</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
    Para entrar a Cifra, establece tu contraseña con este código. Vence en una hora.
  </p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px;font-family:'Courier New',monospace;margin:0 0 20px;">{####}</p>
  <p style="margin:0 0 20px;">
    <a href="https://app.cfocifra.com/set-password?code={####}"
       style="display:inline-block;background:#1550E0;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 22px;border-radius:999px;">
      Establecer contraseña
    </a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#646B85;margin:0;">
    Si no pediste este correo, ignóralo: tu cuenta sigue igual.<br />
    Cifra · CFO virtual. Un producto de Data Frontier.
  </p>
</div>
```

Notas:

- Los colores van en hexadecimal porque los clientes de correo no leen las variables CSS del portal;
  son los mismos valores de `tokens/cifra.tokens.css` (`--cifra-ink`, `--cifra-brand`, `--cifra-ink-3`).
- El código vence en 1 hora (valor fijo de Cognito para ForgotPassword).
- Con el remitente por defecto de Cognito (`COGNITO_DEFAULT`) el límite es de 50 correos al día por
  cuenta; para producción conviene configurar SES en **Messaging → Email**.

### Texto distinto para bienvenida y para "olvidé mi contraseña" (opcional)

Si se quiere un correo de bienvenida diferente al de restablecer, hace falta un trigger
**Custom message** (Lambda). El portal ya marca la bienvenida con `clientMetadata.flow = "welcome"`:

```js
export const handler = async (event) => {
  if (event.triggerSource === "CustomMessage_ForgotPassword") {
    const code = event.request.codeParameter; // "{####}"
    const link = `https://app.cfocifra.com/set-password?code=${code}`;
    if (event.request.clientMetadata?.flow === "welcome") {
      event.response.emailSubject = "Bienvenido a Cifra: establece tu contraseña";
      event.response.emailMessage = `<p>Bienvenido a Cifra.</p><p>Tu código: <b>${code}</b></p><p><a href="${link}">Establecer contraseña</a></p>`;
    } else {
      event.response.emailSubject = "Cifra: restablece tu contraseña";
      event.response.emailMessage = `<p>Tu código para restablecer tu contraseña: <b>${code}</b></p><p><a href="${link}">Restablecer contraseña</a></p>`;
    }
  }
  return event;
};
```

## Variables de entorno

Las mismas de siempre en `.env`: `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
`COGNITO_CLIENT_SECRET` (si el app client tiene secreto), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
Con `DEV_AUTH_BYPASS=true` no se llama a Cognito ni se envían correos (la pantalla lo indica).
