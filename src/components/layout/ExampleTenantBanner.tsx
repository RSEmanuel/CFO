"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { isExampleTenantRfc } from "@/services/tenants/constants";
import { Info } from "lucide-react";

/** Franja fija mientras se consulta la empresa de demostración: sus cifras son de ejemplo, no contabilidad. */
export function ExampleTenantBanner() {
  const { tenants, tenantId } = useSession();
  const { t } = useLocale();

  const active = tenants.find((item) => item.id === tenantId);
  if (!active || !isExampleTenantRfc(active.rfc)) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-4 py-2 text-foreground md:px-6"
    >
      <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 text-sm">
        <span className="font-medium">{t("exampleTenant.banner")}</span>
        <span className="hidden text-muted-foreground md:inline"> · {t("exampleTenant.bannerHelp")}</span>
      </p>
    </div>
  );
}
