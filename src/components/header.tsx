"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ACCOUNT_NAV, isNavActive, PRIMARY_NAV } from "@/lib/nav";
import { usePathname } from "next/navigation";

export function Header() {
  const { user } = useSession();
  const { t } = useLocale();
  const pathname = usePathname();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const titleKey =
    [...PRIMARY_NAV, ...ACCOUNT_NAV].find((item) => isNavActive(pathname, item.href))?.labelKey;
  const title = titleKey ? t(titleKey) : "";

  return (
    <header className="z-30 flex h-[var(--app-header-h)] w-full shrink-0 items-center justify-end gap-4 border-b border-beige-deep bg-chrome px-4 md:px-6">
      <h1 className="sr-only">{title}</h1>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </header>
  );
}
