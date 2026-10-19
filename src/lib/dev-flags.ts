/** Bandera pública para auto-login en el navegador (espejo de DEV_AUTH_BYPASS). */
export const isClientDevAuthBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

/** Correo del auto-login de desarrollo; cada quien pone el suyo en su .env local. */
export const DEV_PARTNER_EMAIL = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL || "cfo.partner@cfo.mx";
