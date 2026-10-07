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
    <div className="pointer-events-none absolute right-4 top-3 z-30 md:right-6 md:top-4">
      <h1 className="sr-only">{title}</h1>
      <TooltipProvider delayDuration={200}>
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
