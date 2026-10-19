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
import type { WelcomeEmailStatus } from "@/auth/service";
import { monthLabelKey } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, effectiveRole, tenants, tenantId, anio, periodo, periodView, refreshMe, setTenantId } = useSession();
  const { locale, setLocale, t } = useLocale();
  const canManage = Boolean(effectiveRole && USER_ADMIN_ROLES.includes(effectiveRole));
  const empresa = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? "—";
  const corte =
    periodView === "ytd"
      ? t("settings.ytdCutoff", { year: anio })
      : `${t(monthLabelKey((periodo || 1) - 1))} ${anio}`;

  const [companyName, setCompanyName] = useState("");
  const [companyRfc, setCompanyRfc] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [onboarded, setOnboarded] = useState<{
    tenantId: string;
    ownerUserId: string;
    ownerEmail: string;
    status: WelcomeEmailStatus;
  } | null>(null);
  const [resending, setResending] = useState(false);

  async function onCreateCompany(event: FormEvent) {
    event.preventDefault();
    setCreatingCompany(true);
    try {
      const created = await apiRequest<{
        tenant: TenantOption;
        ownerEmail: string;
        ownerUserId: string;
        welcomeEmail: WelcomeEmailStatus;
      }>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({ name: companyName, rfc: companyRfc, ownerEmail, ownerName }),
      });
      await refreshMe();
      setTenantId(created.tenant.id);
      setCompanyName("");
      setCompanyRfc("");
      setOwnerEmail("");
      setOwnerName("");
      setOnboarded({
        tenantId: created.tenant.id,
        ownerUserId: created.ownerUserId,
        ownerEmail: created.ownerEmail,
        status: created.welcomeEmail,
      });
      toast.success(t("settings.companyCreated", { name: created.tenant.name }));
    } catch (error) {
      toast.error(error instanceof ApiError ? t(`errors.${error.code}`) : t("settings.companyCreateFailed"));
    } finally {
      setCreatingCompany(false);
    }
  }

  async function onResendWelcome() {
    if (!onboarded) {
      return;
    }
    setResending(true);
    try {
      const result = await apiRequest<{ welcomeEmail: WelcomeEmailStatus }>("/api/admin/users/welcome", {
        method: "POST",
        body: JSON.stringify({ tenantId: onboarded.tenantId, userId: onboarded.ownerUserId }),
      });
      setOnboarded({ ...onboarded, status: result.welcomeEmail });
      toast.success(t("users.resent", { email: onboarded.ownerEmail }));
    } catch {
      setOnboarded({ ...onboarded, status: "failed" });
      toast.error(t("users.resendFailed"));
    } finally {
      setResending(false);
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
            {effectiveRole ? t(`common.roles.${effectiveRole}`) : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">{t("settings.company")}: </span>
            {empresa}
          </p>
          <p>
            <span className="text-muted-foreground">{t("settings.cutoff")}: </span>
            {corte}
          </p>
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
              <div className="space-y-2">
                <Label htmlFor="owner-email">{t("settings.ownerEmail")}</Label>
                <Input
                  id="owner-email"
                  type="email"
                  autoComplete="off"
                  value={ownerEmail}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-name">{t("settings.ownerName")}</Label>
                <Input
                  id="owner-name"
                  autoComplete="off"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={creatingCompany}>
                {creatingCompany ? t("common.creating") : t("settings.createEmptyCompany")}
              </Button>
            </form>
            {onboarded ? (
              <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm" role="status">
                <p>
                  {onboarded.status === "sent"
                    ? t("settings.ownerWelcomeSent", { email: onboarded.ownerEmail })
                    : onboarded.status === "skipped"
                      ? t("users.welcomeSkipped")
                      : t("settings.ownerWelcomeFailed", { email: onboarded.ownerEmail })}
                </p>
                {onboarded.status !== "skipped" ? (
                  <Button type="button" variant="outline" disabled={resending} onClick={onResendWelcome}>
                    {resending ? t("users.resending") : t("settings.resendWelcome")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
