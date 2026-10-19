/**
 * Correo de bienvenida (mensaje de verificación de Cognito). Fuente única de verdad: la vista
 * previa del portal y `npm run email:export` salen de aquí; la consola de AWS recibe el HTML exportado.
 *
 * Los clientes de correo no leen variables CSS ni SVG, así que los colores van en hexadecimal con los
 * mismos valores de tokens/cifra.tokens.css y el encabezado es tipográfico.
 * Cognito usa esta plantilla también para "olvidé mi contraseña": el texto sirve para ambos casos.
 */

const COLOR = {
  paper: "#F1F3FB", // --cifra-paper
  surface: "#FFFFFF", // --cifra-surface
  surface2: "#E4E8F7", // --cifra-surface-2
  ink: "#101425", // --cifra-ink
  ink2: "#3B4260", // --cifra-ink-2
  ink3: "#646B85", // --cifra-ink-3
  line: "#D2D8EE", // --cifra-line
  brand: "#1550E0", // --cifra-brand
  brandContrast: "#FFFFFF", // --cifra-brand-contrast
} as const;

const FONT = {
  serif: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans: "'DM Sans', Arial, Helvetica, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', Courier, monospace",
} as const;

export const WELCOME_EMAIL_CODE_PLACEHOLDER = "{{CODE}}";
export const WELCOME_EMAIL_APP_URL_PLACEHOLDER = "{{APP_URL}}";

/** Formato que Cognito sustituye por el código y URL pública del portal. */
export const COGNITO_CODE_PARAMETER = "{####}";
export const PRODUCTION_APP_URL = "https://app.cfocifra.com";

export const WELCOME_EMAIL_SUBJECT = "Cifra: crea tu contraseña para entrar";

const SET_PASSWORD_URL = `${WELCOME_EMAIL_APP_URL_PLACEHOLDER}/set-password?code=${WELCOME_EMAIL_CODE_PLACEHOLDER}`;

export const WELCOME_EMAIL_HTML = `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${WELCOME_EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu código para entrar a Cifra. Vence en una hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.paper};">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td style="padding:0 8px 20px;font-family:${FONT.serif};font-size:30px;font-weight:500;line-height:1;letter-spacing:-0.5px;color:${COLOR.ink};">Cifra</td>
</tr>
<tr>
<td style="background-color:${COLOR.surface};border:1px solid ${COLOR.line};border-radius:16px;padding:40px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:${FONT.mono};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.ink3};padding-bottom:12px;">Tu acceso</td>
</tr>
<tr>
<td style="font-family:${FONT.serif};font-size:34px;font-weight:500;line-height:1.15;letter-spacing:-0.6px;color:${COLOR.ink};padding-bottom:16px;">Te damos la bienvenida a Cifra</td>
</tr>
<tr>
<td style="font-family:${FONT.sans};font-size:16px;line-height:1.6;color:${COLOR.ink2};padding-bottom:28px;">Aquí vas a ver tu caja, tu rentabilidad y qué conviene hacer cada mes, explicado sin tecnicismos. Para entrar, primero crea tu contraseña con este código:</td>
</tr>
<tr>
<td align="center" style="background-color:${COLOR.surface2};border-radius:12px;padding:20px 12px;">
<div style="font-family:${FONT.mono};font-size:32px;font-weight:500;letter-spacing:10px;color:${COLOR.ink};">${WELCOME_EMAIL_CODE_PLACEHOLDER}</div>
<div style="font-family:${FONT.sans};font-size:13px;line-height:1.4;color:${COLOR.ink3};padding-top:8px;">Vence en una hora</div>
</td>
</tr>
<tr>
<td align="center" style="padding:32px 0 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="${COLOR.brand}" style="border-radius:999px;">
<a href="${SET_PASSWORD_URL}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT.sans};font-size:16px;font-weight:500;line-height:1;color:${COLOR.brandContrast};text-decoration:none;border-radius:999px;">Crear mi contraseña</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="font-family:${FONT.sans};font-size:14px;line-height:1.6;color:${COLOR.ink3};border-top:1px solid ${COLOR.line};padding-top:20px;">El botón abre la página con el código ya escrito; solo pon tu correo y tu nueva contraseña. Si ya tenías cuenta y pediste cambiar tu contraseña, usa este mismo código.</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:24px 8px 0;font-family:${FONT.sans};font-size:12px;line-height:1.6;color:${COLOR.ink3};">Si no esperabas este correo, ignóralo: tu cuenta sigue igual.<br>Cifra · CFO virtual. Un producto de Data Frontier.</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;

export function renderWelcomeEmail(code: string, appUrl: string): string {
  return WELCOME_EMAIL_HTML.split(WELCOME_EMAIL_CODE_PLACEHOLDER)
    .join(code)
    .split(WELCOME_EMAIL_APP_URL_PLACEHOLDER)
    .join(appUrl.replace(/\/+$/, ""));
}
