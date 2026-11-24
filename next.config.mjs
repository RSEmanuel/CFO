/**
 * Encabezados básicos de seguridad para todo el sitio:
 * - Nadie puede meter Cifra dentro de otro sitio (X-Frame-Options + frame-ancestors).
 * - El navegador no adivina el tipo de archivo (nosniff).
 * - Al salir hacia otro sitio solo se manda el dominio, nunca la dirección completa.
 * La vista previa del correo de bienvenida usa un iframe con srcDoc y no se ve afectada.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
