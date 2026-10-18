"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/dashboard/settings", labelKey: "settings.tabGeneral" },
  { href: "/dashboard/settings/usuarios", labelKey: "settings.tabUsers" },
] as const;

/** Pestañas de Configuración. Quien solo consulta no ve la de Usuarios. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { t } = useLocale();
  const canManage = Boolean(user && USER_ADMIN_ROLES.includes(user.role));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-bold tracking-tight text-clay">{t("nav.settings")}</p>
      </div>
      {canManage ? (
        <nav
          aria-label={t("settings.tabsAria")}
          className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-control px-4 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-clay shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {children}
    </div>
  );
}
