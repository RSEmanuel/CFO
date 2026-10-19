"use client";

import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Configuración de la persona: idioma, su sesión y su contraseña. Los clientes viven en Clientes. */
export default function SettingsPage() {
  const { user } = useSession();
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.languageTitle")}</CardTitle>
          <CardDescription>{t("settings.languageHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="inline-flex h-10 items-center rounded-control border border-input bg-card p-0.5"
            role="group"
            aria-label={t("settings.languageAria")}
          >
            {([
              ["es", "settings.esp"],
              ["en", "settings.eng"],
            ] as const).map(([value, labelKey]) => (
              <button
                key={value}
                type="button"
                aria-pressed={locale === value}
                onClick={() => setLocale(value as Locale)}
                className={cn(
                  "h-9 min-w-12 rounded-control px-3 text-sm font-medium transition-colors",
                  locale === value
                    ? "bg-secondary text-clay shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sessionTitle")}</CardTitle>
          <CardDescription>{t("settings.sessionHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            <span className="text-muted-foreground">{t("settings.email")}: </span>
            {user?.email ?? "—"}
          </p>
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
