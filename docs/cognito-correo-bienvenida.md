# Correo de bienvenida (alta de usuarios)

Al dar de alta a alguien en **Clientes → (cliente) → Personas con acceso**, Cifra ya no muestra una contraseña temporal.
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

## Plantilla del correo

El correo de bienvenida y el de "olvidé mi contraseña" usan la **misma plantilla** de Cognito
(mensaje de verificación), así que el texto sirve para los dos casos.

- **Fuente única:** `src/services/email/welcomeEmailTemplate.ts` (asunto, HTML con `{{CODE}}` y
  `{{APP_URL}}`, y `renderWelcomeEmail`). Para cambiar el diseño o el texto, edita ese archivo.
- **Vista previa:** en el portal, **Clientes → Correo de bienvenida** (`/dashboard/clientes/correo-bienvenida`, solo ADMIN y CFO_PARTNER),
  con el código ficticio `123456`.
- **HTML de referencia para AWS:** `docs/templates/welcome-email.html`, generado con

```bash
npm run email:export
```

  El script sustituye `{{CODE}}` por `{####}` y `{{APP_URL}}` por `https://app.cfocifra.com`, y falla
  si falta `{####}` o si el HTML pasa de 20,000 caracteres (límite de Cognito). No edites ese archivo a
  mano: regenéralo.

### Subirla a Cognito

1. Corre `npm run email:export` y abre `docs/templates/welcome-email.html`; copia todo su contenido.
2. En AWS: **Amazon Cognito → User pools → (pool de Cifra) → Messaging → Message templates →
   Verification message → Edit**.
3. **Verification type:** Code.
4. **Email subject:** el que imprime el script (hoy `Cifra: crea tu contraseña para entrar`).
5. **Email message:** pega el HTML completo y guarda (**Save changes**).
6. Prueba: da de alta un usuario de prueba con `DEV_AUTH_BYPASS=false` o usa "Olvidé mi contraseña"
   con una cuenta tuya, y revisa el correo en Gmail y Outlook.

Notas:

- Los colores van en hexadecimal porque los clientes de correo no leen las variables CSS del portal;
  son los mismos valores de `tokens/cifra.tokens.css`, mapeados en el objeto `COLOR` de la plantilla.
- Sin SVG (Gmail no los muestra): el encabezado es la palabra "Cifra" en serif. Las fuentes de marca
  se piden por nombre y caen a Georgia, Arial y Courier New donde no están instaladas.
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
