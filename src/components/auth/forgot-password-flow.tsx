"use client";

import { meetsPasswordPolicy } from "@/auth/passwordPolicy";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, apiRequest } from "@/lib/api";
import { FormEvent, useState } from "react";

const REASON_MESSAGE_KEY: Record<string, string> = {
  codeWrong: "auth.resetCodeWrong",
  codeExpired: "auth.resetCodeExpired",
  passwordPolicy: "auth.resetWeak",
  tooManyAttempts: "auth.resetTooManyAttempts",
  devBypass: "auth.resetDevBypass",
};

const LABEL_CLASS = "text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground";
const PRIMARY_BUTTON_CLASS =
  "flex h-12 items-center justify-center rounded-full bg-clay text-[15px] font-medium text-white transition-colors hover:bg-clay-hover disabled:pointer-events-none disabled:opacity-50";
const LOCKED_INPUT_CLASS = "cursor-not-allowed bg-muted text-muted-foreground";
const LINK_BUTTON_CLASS = "text-center text-[13.5px] text-muted-foreground hover:text-clay";

function errorMessageKey(error: unknown): string {
  const reason = error instanceof ApiError ? error.details?.reason : undefined;
  return (typeof reason === "string" ? REASON_MESSAGE_KEY[reason] : undefined) ?? "auth.resetFailed";
}

/**
 * Dos pasos dentro de la tarjeta de login: pedir el código por correo y luego
 * capturar código + contraseña nueva. Al terminar regresa al login con el correo.
 *
 * variant="welcome" (pantalla /set-password del correo de bienvenida): empieza directo en el
 * paso del código, pide también el correo y usa los textos de "Establece tu contraseña".
 * Si el enlace trae correo o código, esos campos van de solo lectura; sin correo, el correo se
 * puede escribir. Al reenviar el código se desbloquea el campo, porque el anterior ya no sirve.
 */
export function ForgotPasswordFlow({
  initialEmail,
  initialCode = "",
  variant = "reset",
  onDone,
  onCancel,
}: {
  initialEmail: string;
  initialCode?: string;
  variant?: "reset" | "welcome";
  onDone: (email: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const welcome = variant === "welcome";
  const [step, setStep] = useState<"request" | "reset">(welcome ? "reset" : "request");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const emailLocked = welcome && initialEmail.trim() !== "";
  const codeLocked = welcome && initialCode !== "" && !codeUnlocked;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      await apiRequest<{ sent: true }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return true;
    } catch (err) {
      setError(t(errorMessageKey(err)));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onRequest(event: FormEvent) {
    event.preventDefault();
    if (await requestCode()) {
      setNotice(null);
      setStep("reset");
    }
  }

  async function onResend() {
    if (welcome && !email.trim()) {
      setError(t("setPassword.emailFirst"));
      return;
    }
    if (await requestCode()) {
      setNotice(t("auth.resetResent"));
      setCode("");
      setCodeUnlocked(true);
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (welcome && !email.trim()) {
      setError(t("setPassword.emailFirst"));
      return;
    }
    const cleanCode = code.replace(/\s/g, "");
    if (!/^[0-9]{6}$/.test(cleanCode)) {
      setError(t("auth.resetCodeFormat"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.resetMismatch"));
      return;
    }
    if (!meetsPasswordPolicy(newPassword)) {
      setError(t("auth.resetWeak"));
      return;
    }

    setPending(true);
    try {
      await apiRequest<{ reset: true }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code: cleanCode, newPassword }),
      });
      onDone(email);
    } catch (err) {
      setError(t(errorMessageKey(err)));
    } finally {
      setPending(false);
    }
  }

  const feedback = (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </>
  );

  if (step === "request") {
    return (
      <>
        <div className="flex flex-col gap-2">
          <h2 className="font-sans text-[26px] font-normal tracking-[-0.01em] text-foreground">
            {t("auth.forgotTitle")}
          </h2>
          <p className="text-sm leading-[1.5] text-muted-foreground">{t("auth.forgotHelp")}</p>
        </div>
        <form className="flex flex-col gap-6" onSubmit={onRequest}>
          <label className="flex flex-col gap-[7px]" htmlFor="forgot-email">
            <span className={LABEL_CLASS}>{t("auth.email")}</span>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-[46px] bg-background"
            />
          </label>
          {feedback}
          <div className="flex flex-col gap-4">
            <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
              {pending ? t("auth.forgotSending") : t("auth.forgotSend")}
            </button>
            <button type="button" onClick={onCancel} className={LINK_BUTTON_CLASS}>
              {t("auth.backToLogin")}
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="font-sans text-[26px] font-normal tracking-[-0.01em] text-foreground">
          {welcome ? t("setPassword.title") : t("auth.resetTitle")}
        </h2>
        <p className="break-words text-sm leading-[1.5] text-muted-foreground">
          {welcome ? t(emailLocked ? "setPassword.helpPrefilled" : "setPassword.help") : t("auth.resetHelp", { email })}
        </p>
      </div>
      <form className="flex flex-col gap-6" onSubmit={onReset}>
        <div className="flex flex-col gap-4">
          {welcome ? (
            <label className="flex flex-col gap-[7px]" htmlFor="reset-email">
              <span className={LABEL_CLASS}>{t("auth.email")}</span>
              <Input
                id="reset-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                readOnly={emailLocked}
                aria-readonly={emailLocked}
                className={`h-[46px] ${emailLocked ? LOCKED_INPUT_CLASS : "bg-background"}`}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-[7px]" htmlFor="reset-code">
            <span className={LABEL_CLASS}>{t("auth.resetCode")}</span>
            <Input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              readOnly={codeLocked}
              aria-readonly={codeLocked}
              className={`cifra-num h-[46px] tracking-[0.3em] ${codeLocked ? LOCKED_INPUT_CLASS : "bg-background"}`}
            />
          </label>
          <label className="flex flex-col gap-[7px]" htmlFor="reset-new-password">
            <span className={LABEL_CLASS}>{t("auth.resetNewPassword")}</span>
            <Input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby="reset-rules"
              className="h-[46px] bg-background"
            />
            <span id="reset-rules" className="text-xs text-muted-foreground">
              {t("auth.resetRules")}
            </span>
          </label>
          <label className="flex flex-col gap-[7px]" htmlFor="reset-confirm-password">
            <span className={LABEL_CLASS}>{t("auth.resetConfirmPassword")}</span>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-[46px] bg-background"
            />
          </label>
        </div>
        {feedback}
        <div className="flex flex-col gap-4">
          <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
            {pending ? t("auth.resetSubmitting") : welcome ? t("setPassword.submit") : t("auth.resetSubmit")}
          </button>
          <button type="button" onClick={onResend} disabled={pending} className={LINK_BUTTON_CLASS}>
            {t("auth.resetResend")}
          </button>
          <button type="button" onClick={onCancel} className={LINK_BUTTON_CLASS}>
            {t("auth.backToLogin")}
          </button>
        </div>
      </form>
    </>
  );
}
