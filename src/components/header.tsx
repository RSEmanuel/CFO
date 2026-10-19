"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ACCOUNT_NAV, isNavActive, PRIMARY_NAV, visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function Header() {
  const { user, canClientPreview, isClientPreviewMode, toggleClientPreviewMode } = useSession();
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const titleKey =
    [...PRIMARY_NAV, ...ACCOUNT_NAV].find((item) => isNavActive(pathname, item.href))?.labelKey;
  const title = titleKey ? t(titleKey) : "";

  function onTogglePreview(): void {
    // Al entrar, si la pantalla actual es interna, se lleva al usuario a una que el cliente sí ve.
    if (!isClientPreviewMode) {
      const clientNav = visibleNav([...PRIMARY_NAV, ...ACCOUNT_NAV], "CLIENT_VIEWER");
      const restricted = [...PRIMARY_NAV, ...ACCOUNT_NAV].some(
        (item) => isNavActive(pathname, item.href) && !clientNav.includes(item),
      );
      if (restricted) {
        router.push("/dashboard/control");
      }
    }
    toggleClientPreviewMode();
  }

  const previewLabel = isClientPreviewMode ? t("clientPreview.exit") : t("clientPreview.enter");

  return (
    <div className="pointer-events-none absolute right-4 top-3 z-30 flex items-center gap-2 md:right-6 md:top-4">
      <h1 className="sr-only">{title}</h1>
      <TooltipProvider delayDuration={200}>
        {canClientPreview ? (
          <button
            type="button"
            onClick={onTogglePreview}
            aria-pressed={isClientPreviewMode}
            aria-label={isClientPreviewMode ? previewLabel : t("clientPreview.enterAria")}
            className={cn(
              "pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium shadow-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isClientPreviewMode
                ? "bg-primary text-primary-foreground ring-primary hover:bg-primary/90"
                : "bg-card text-foreground ring-border hover:text-clay",
            )}
          >
            {isClientPreviewMode ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">{previewLabel}</span>
          </button>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="pointer-events-auto shrink-0 rounded-full shadow-sm ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("common.sessionOf", { email: user?.email ?? t("common.user") })}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-card text-[11px] font-medium text-clay">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent>{user?.email ?? t("common.user")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
