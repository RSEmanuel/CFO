"use client";

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
import { EMPTY_COMPAC_TENANT, EMPTY_COMPAC_USERS } from "@/services/tenants/constants";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, tenants, tenantId, anio, periodo, periodView, refreshMe, setTenantId } = useSession();
  const { locale, setLocale, t } = useLocale();
  const canManage = user?.role === "ADMIN" || user?.role === "CFO_PARTNER";
  const empresa = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? "—";
  const corte =
    periodView === "ytd"
      ? t("settings.ytdCutoff", { year: anio })
      : `${t(monthLabelKey((periodo || 1) - 1))} ${anio}`;

  const [companyName, setCompanyName] = useState<string>(EMPTY_COMPAC_TENANT.name);
  const [companyRfc, setCompanyRfc] = useState<string>(EMPTY_COMPAC_TENANT.rfc);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [userEmail, setUserEmail] = useState<string>(EMPTY_COMPAC_USERS.partnerEmail);
  const [userPassword, setUserPassword] = useState("DevMode123!");
  const [userRole, setUserRole] = useState<"CFO_PARTNER" | "CLIENT_VIEWER">("CFO_PARTNER");
  const [creatingUser, setCreatingUser] = useState(false);

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

  async function onCreateUser(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) {
      toast.error(t("settings.selectCompanyFirst"));
      return;
    }
    setCreatingUser(true);
    try {
      await apiRequest("/api/auth/register-user", {
        method: "POST",
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
          role: userRole,
          tenantId,
        }),
      });
      toast.success(t("settings.userCreated", { email: userEmail, company: empresa }));
    } catch (error) {
      toast.error(error instanceof ApiError ? t(`errors.${error.code}`) : t("settings.userCreateFailed"));
    } finally {
      setCreatingUser(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-bold tracking-tight text-clay">{t("nav.settings")}</p>
        <p className="text-sm text-muted-foreground">{t("settings.intro")}</p>
      </div>
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
          <p className="text-muted-foreground">{t("settings.compacHint")}</p>
        </CardContent>
      </Card>

      {canManage ? (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.userTitle")}</CardTitle>
              <CardDescription>{t("settings.userHelp", { company: empresa })}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onCreateUser}>
                <div className="space-y-2">
                  <Label htmlFor="user-email">{t("settings.userEmail")}</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={userEmail}
                    onChange={(event) => setUserEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-password">{t("settings.userPassword")}</Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={userPassword}
                    onChange={(event) => setUserPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-role">{t("settings.userRole")}</Label>
                  <select
                    id="user-role"
                    className="flex h-10 w-full rounded-control border border-input bg-background px-3 py-2 text-sm"
                    value={userRole}
                    onChange={(event) =>
                      setUserRole(event.target.value as "CFO_PARTNER" | "CLIENT_VIEWER")
                    }
                  >
                    <option value="CFO_PARTNER">{t("common.roles.CFO_PARTNER")}</option>
                    <option value="CLIENT_VIEWER">{t("common.roles.CLIENT_VIEWER")}</option>
                  </select>
                </div>
                <Button type="submit" disabled={creatingUser || !tenantId}>
                  {creatingUser ? t("common.creating") : t("settings.createUser")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
