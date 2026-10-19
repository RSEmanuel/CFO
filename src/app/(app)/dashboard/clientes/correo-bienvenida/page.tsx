"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import {
  PRODUCTION_APP_URL,
  WELCOME_EMAIL_SUBJECT,
  renderWelcomeEmail,
} from "@/services/email/welcomeEmailTemplate";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

// Código evidentemente ficticio: la vista previa nunca muestra uno real.
const SAMPLE_CODE = "123456";

/** Vista previa del correo de bienvenida tal como lo manda Cognito. */
export default function CorreoBienvenidaPage() {
  const { effectiveRole } = useSession();
  const { t } = useLocale();
  const canManage = Boolean(effectiveRole && USER_ADMIN_ROLES.includes(effectiveRole));
  const html = useMemo(() => renderWelcomeEmail(SAMPLE_CODE, PRODUCTION_APP_URL), []);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">{t("welcomeEmail.adminOnly")}</p>;
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("nav.clients")}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("welcomeEmail.title")}</CardTitle>
          <CardDescription>{t("welcomeEmail.help")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-muted-foreground">{t("welcomeEmail.subject")}</dt>
            <dd>{WELCOME_EMAIL_SUBJECT}</dd>
            <dt className="text-muted-foreground">{t("welcomeEmail.sampleCode")}</dt>
            <dd className="cifra-num">{SAMPLE_CODE}</dd>
          </dl>
          <iframe
            title={t("welcomeEmail.iframeTitle")}
            srcDoc={html}
            sandbox=""
            className="h-[760px] w-full rounded-card border border-border bg-[var(--cifra-paper)]"
          />
          <p className="text-xs text-muted-foreground">{t("welcomeEmail.exportHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
