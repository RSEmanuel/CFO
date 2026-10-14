import { LandingPage } from "@/components/landing/LandingPage";
import { loadLandingManifest } from "@/components/landing/manifest.server";
import type { Metadata } from "next";

/**
 * Landing publica de marketing (scroll-world). Es una ruta fuera del shell autenticado `(app)`:
 * no usa AuthGate y el middleware solo protege /api, asi que responde sin sesion.
 * El manifiesto de assets se calcula en el build: al agregar videos hay que volver a desplegar.
 */
export const metadata: Metadata = {
  title: { absolute: "Cifra · CFO virtual" },
  description:
    "Cifra · CFO virtual. Sube tu contabilidad y ve en claro tus resultados, tu caja y tu cobranza. Hecho para dueños de PyMEs en México.",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Cifra",
    title: "Cifra · CFO virtual",
    description: "Tus cifras, en claro. Resultados, caja y cobranza de tu empresa en un solo lugar.",
  },
};

/** Correo para "Solicitar demo". Sin variable no se inventa uno: la pagina muestra un marcador. */
function resolveDemoEmail(): string | undefined {
  const value = process.env.NEXT_PUBLIC_LANDING_DEMO_EMAIL?.trim();
  return value && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(value) ? value : undefined;
}

export default function LandingRoute() {
  return <LandingPage manifest={loadLandingManifest()} demoEmail={resolveDemoEmail()} />;
}
