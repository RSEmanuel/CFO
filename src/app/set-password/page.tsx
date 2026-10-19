"use client";

import { ForgotPasswordFlow } from "@/components/auth/forgot-password-flow";
import { useLocale } from "@/context/LocaleContext";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const PRIMARY_LINK_CLASS =
  "flex h-12 items-center justify-center rounded-full bg-clay text-[15px] font-medium text-white transition-colors hover:bg-clay-hover";

/**
 * Pantalla del correo de bienvenida: la persona escribe su correo, el código que le llegó (viene
 * prellenado si abrió el enlace) y su contraseña dos veces. Al terminar va a /login.
 */
function SetPasswordCard() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const initialCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, 6);

  return (
    <div className="flex w-full min-w-0 max-w-[420px] flex-col gap-6 rounded-card border border-beige-deep bg-card p-8 shadow-[var(--shadow-card)] sm:p-10">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- mismo lockup SVG que el login */}
        <img src="/assets/cifra-lockup.svg" alt={t("common.appName")} className="h-9 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/cifra-lockup-dark.svg" alt={t("common.appName")} className="hidden h-9 w-auto dark:block" />
      </div>
      {doneEmail ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="font-sans text-[26px] font-normal tracking-[-0.01em] text-foreground">
              {t("setPassword.doneTitle")}
            </h2>
            <p className="break-words text-sm leading-[1.5] text-muted-foreground">
              {t("setPassword.doneHelp", { email: doneEmail })}
            </p>
          </div>
          <Link href="/login" className={PRIMARY_LINK_CLASS}>
            {t("setPassword.goLogin")}
          </Link>
        </>
      ) : (
        <ForgotPasswordFlow
          variant="welcome"
          initialEmail={params.get("email") ?? ""}
          initialCode={initialCode}
          onDone={setDoneEmail}
          onCancel={() => router.push("/login")}
        />
      )}
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={null}>
        <SetPasswordCard />
      </Suspense>
    </main>
  );
}
