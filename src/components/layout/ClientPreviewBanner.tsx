"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { Eye, X } from "lucide-react";

/** Franja fija mientras ADMIN o CFO_PARTNER recorren el portal con la vista de cliente. */
export function ClientPreviewBanner() {
  const { isClientPreviewMode, toggleClientPreviewMode, tenants, tenantId, user } = useSession();
  const { t } = useLocale();

  if (!isClientPreviewMode) {
    return null;
  }

  const company = tenants.find((item) => item.id === tenantId)?.name ?? user?.tenant.name ?? t("common.company");

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-primary px-4 py-2 text-primary-foreground md:px-6"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 text-sm">
          <span className="font-medium">{t("clientPreview.banner", { company })}</span>
          <span className="hidden opacity-80 md:inline"> · {t("clientPreview.bannerHelp")}</span>
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 shrink-0 gap-1.5 rounded-full"
        onClick={toggleClientPreviewMode}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        {t("clientPreview.exit")}
      </Button>
    </div>
  );
}
