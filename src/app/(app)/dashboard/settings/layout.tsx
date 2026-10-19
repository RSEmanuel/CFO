"use client";

import { useLocale } from "@/context/LocaleContext";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Configuración es solo de la persona; usuarios y clientes viven en Clientes. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();

  // Errores del portal tiene su propia entrada en el menú y su propio encabezado.
  if (pathname.startsWith("/dashboard/settings/errores")) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-bold tracking-tight text-clay">{t("nav.settings")}</p>
      </div>
      {children}
    </div>
  );
}
