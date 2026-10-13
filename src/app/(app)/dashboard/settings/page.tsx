"use client";

import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ApiError, apiRequest } from "@/lib/api";
import { type TenantOption } from "@/lib/session-types";
import { monthLabelKey } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { EMPTY_COMPAC_TENANT } from "@/services/tenants/constants";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, tenants, tenantId, anio, periodo, periodView, refreshMe, setTenantId } = useSession();
  const { locale, setLocale, t } = useLocale();
  const canManage = Boolean(user && USER_ADMIN_ROLES.includes(user.role));
  const empresa = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? "—";
  const corte =
    periodView === "ytd"
      ? t("settings.ytdCutoff", { year: anio })
      : `${t(monthLabelKey((periodo || 1) - 1))} ${anio}`;

  const [companyName, setCompanyName] = useState<string>(EMPTY_COMPAC_TENANT.name);
  const [companyRfc, setCompanyRfc] = useState<string>(EMPTY_COMPAC_TENANT.rfc);
  const [creatingCompany, setCreatingCompany] = useState(false);

  async function onCreateCompany(event: FormEvent) {
    event.preventDefault();
    setCreatingCompany(true);
    try {
      const created = await apiRequest<TenantOption>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({ name: companyName, rfc: companyRfc }),
      });
      await refreshMe();
      setTenantId(created.id);
      toast.success(t("settings.companyCreated", { name: created.name }));
    } catch (error) {
      toast.error(error instanceof ApiError ? t(`errors.${error.code}`) : t("settings.companyCreateFailed"));
    } finally {
      setCreatingCompany(false);
    }
  }

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
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("settings.email")}: </span>
            {user?.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">{t("settings.role")}: </span>
            {user?.role ? t(`common.roles.${user.role}`) : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">{t("settings.company")}: </span>
            {empresa}
          </p>
          <p>
            <span className="text-muted-foreground">{t("settings.cutoff")}: </span>
            {corte}
          </p>
          {canManage ? <p className="text-muted-foreground">{t("settings.compacHint")}</p> : null}
        </CardContent>
      </Card>

      <ChangePasswordCard />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.newCompany")}</CardTitle>
            <CardDescription>{t("settings.newCompanyHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onCreateCompany}>
              <div className="space-y-2">
                <Label htmlFor="tenant-name">{t("settings.name")}</Label>
                <Input
                  id="tenant-name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-rfc">{t("settings.rfc")}</Label>
                <Input
                  id="tenant-rfc"
                  value={companyRfc}
                  onChange={(event) => setCompanyRfc(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={creatingCompany}>
                {creatingCompany ? t("common.creating") : t("settings.createEmptyCompany")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
