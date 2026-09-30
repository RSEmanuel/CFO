"use client";

import { Input } from "@/components/ui/input";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ApiError } from "@/lib/api";
import { DEV_PARTNER_EMAIL, isClientDevAuthBypass } from "@/lib/dev-flags";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const { login, user, loading } = useSession();
  const { t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState(isClientDevAuthBypass ? DEV_PARTNER_EMAIL : "");
  const [password, setPassword] = useState(isClientDevAuthBypass ? "DevMode123!" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? t(`errors.${err.code}`) : t("auth.loginFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full min-w-0 flex-col items-stretch gap-8 overflow-x-hidden bg-background p-5 sm:p-10 lg:flex-row lg:gap-0">
      <section className="flex min-h-[360px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-panel border border-foreground/[0.08] bg-beige p-8 sm:p-12 lg:min-h-[820px] lg:w-[748px] lg:shrink-0 lg:px-16 lg:py-[60px]">
        <div className="flex flex-col gap-[26px]">
          <p className="text-[19px] font-semibold uppercase leading-none tracking-[0.22em] text-clay">
            {t("common.appName")}
          </p>
          <h1 className="max-w-[620px] break-words font-serif text-[40px] font-normal leading-[1.1] tracking-[-0.021em] text-foreground sm:text-balance sm:text-[48px]">
            {t("auth.headlineLead")}
            <span className="text-clay underline decoration-clay-hover decoration-2 underline-offset-[7px]">
              {t("auth.clarity")}
            </span>
            {t("auth.headlineTail")}
          </h1>
          <p className="max-w-[540px] text-[17px] leading-[1.6] text-muted-foreground">
            {t("auth.subhead")}
          </p>
        </div>

        <div className="hidden items-end gap-[34px] lg:flex">
          {[
            ["12", t("auth.statCompanies")],
            ["MXN", t("auth.statCurrency")],
            ["YTD 2026", t("auth.statPeriod")],
          ].map(([value, label], index) => (
            <div key={label} className="contents">
              {index > 0 ? <span className="w-px self-stretch bg-beige-deep" /> : null}
              <div className="flex flex-col gap-2.5">
                <p className="financial-nums text-[34px] font-medium leading-none tracking-[-0.015em] text-clay">
                  {value}
                </p>
                <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden flex-col gap-[30px] lg:flex">
          <div>
            <div className="flex items-baseline justify-between pb-3.5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              <span>{t("auth.previewTitle")}</span>
              <span>{t("auth.previewFigures")}</span>
            </div>
            {[
              [t("auth.previewIncome"), "48,920,415", ""],
              [t("auth.previewCogs"), "(31,142,880)", "muted"],
              [t("auth.previewGrossProfit"), "17,777,535", "strong"],
              [t("auth.previewGrossMargin"), "36.3%", "muted"],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-baseline justify-between border-t border-beige-deep py-[13px]">
                <span
                  className={`font-serif text-lg ${
                    tone === "muted" ? "text-muted-foreground" : "text-foreground"
                  } ${tone === "strong" ? "font-medium" : ""}`}
                >
                  {label}
                </span>
                <span
                  className={`financial-nums text-[15px] ${
                    tone === "muted" ? "text-muted-foreground" : "text-foreground"
                  } ${tone === "strong" ? "font-medium" : ""}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t border-beige-deep pt-5 text-[12.5px] tracking-[0.04em] text-muted-foreground">
            {t("auth.footer")}
          </p>
        </div>
      </section>

      <section className="flex min-w-0 flex-1 items-center justify-center py-4 lg:py-0">
        <div className="flex w-full min-w-0 max-w-[400px] flex-col gap-6 rounded-card border border-beige-deep bg-card p-8 shadow-[var(--shadow-card)] sm:p-10">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-[26px] font-normal tracking-[-0.01em] text-foreground">
              {t("auth.title")}
            </h2>
            <p className="text-sm leading-[1.5] text-muted-foreground">
              {isClientDevAuthBypass ? t("auth.accessDev") : t("auth.access")}
            </p>
          </div>

          <form className="flex flex-col gap-6" onSubmit={onSubmit}>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-[7px]" htmlFor="email">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t("auth.email")}
                </span>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-[46px] bg-background"
                />
              </label>
              <label className="flex flex-col gap-[7px]" htmlFor="password">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t("auth.password")}
                </span>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-[46px] bg-background"
                />
              </label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={pending}
                className="flex h-12 items-center justify-center rounded-full bg-clay text-[15px] font-medium text-white transition-colors hover:bg-clay-hover disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? t("auth.submitting") : t("auth.submit")}
              </button>
              <button type="button" className="text-center text-[13.5px] text-muted-foreground hover:text-clay">
                {t("auth.forgot")}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
