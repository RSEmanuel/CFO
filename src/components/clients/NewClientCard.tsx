"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ApiError, apiRequest } from "@/lib/api";
import type { TenantOption } from "@/lib/session-types";
import type { WelcomeEmailStatus } from "@/auth/service";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

/** Alta de un cliente nuevo (empresa vacía + su dueño con correo de bienvenida). */
export function NewClientCard({ onCreated }: { onCreated: (tenant: TenantOption) => void }) {
  const { refreshMe } = useSession();
  const { t } = useLocale();
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
      onCreated(created.tenant);
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
    <Card>
      <CardHeader>
        <CardTitle>{t("clients.newTitle")}</CardTitle>
        <CardDescription>{t("settings.newCompanyHelp")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onCreateCompany}>
          <div className="space-y-2">
            <Label htmlFor="tenant-name">{t("settings.name")}</Label>
            <Input id="tenant-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-rfc">{t("settings.rfc")}</Label>
            <Input id="tenant-rfc" value={companyRfc} onChange={(event) => setCompanyRfc(event.target.value)} required />
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
            <Input id="owner-name" autoComplete="off" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
          </div>
          <Button type="submit" disabled={creatingCompany}>
            {creatingCompany ? t("common.creating") : t("clients.create")}
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
  );
}
