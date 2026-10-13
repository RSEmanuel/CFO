"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, apiRequest } from "@/lib/api";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

/** Misma política que el User Pool: 8+ caracteres, mayúscula, minúscula y número. */
function meetsPasswordPolicy(value: string): boolean {
  return value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

const REASON_MESSAGE_KEY: Record<string, string> = {
  currentPasswordWrong: "settings.currentPasswordWrong",
  passwordPolicy: "settings.passwordWeak",
  tooManyAttempts: "settings.passwordTooManyAttempts",
  devBypass: "settings.passwordDevBypass",
};

export function ChangePasswordCard() {
  const { t } = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("settings.passwordMismatch"));
      return;
    }
    if (!meetsPasswordPolicy(newPassword)) {
      setError(t("settings.passwordWeak"));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t("settings.passwordSame"));
      return;
    }

    setPending(true);
    try {
      await apiRequest<{ changed: true }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("settings.passwordChanged"));
    } catch (err) {
      const reason = err instanceof ApiError ? err.details?.reason : undefined;
      const key = typeof reason === "string" ? REASON_MESSAGE_KEY[reason] : undefined;
      setError(t(key ?? "settings.passwordChangeFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.passwordTitle")}</CardTitle>
        <CardDescription>{t("settings.passwordHelp")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="max-w-md space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="current-password">{t("settings.currentPassword")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("settings.newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby="new-password-rules"
              required
            />
            <p id="new-password-rules" className="text-xs text-muted-foreground">
              {t("settings.passwordRules")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("settings.confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t("settings.changingPassword") : t("settings.changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
