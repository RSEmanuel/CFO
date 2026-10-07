"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ACCOUNT_NAV, isNavActive, PRIMARY_NAV, visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useSession();
  const { t } = useLocale();
  const items = [...visibleNav(PRIMARY_NAV, user?.role), ...visibleNav(ACCOUNT_NAV, user?.role)];

  return (
    <div className="flex items-center gap-2 border-b border-beige-deep bg-chrome px-3 py-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("common.openMenu")}>
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[280px] border-beige-deep bg-chrome">
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/cifra-lockup.svg" alt={t("common.appName")} className="h-8 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/cifra-lockup-dark.svg" alt={t("common.appName")} className="hidden h-8 w-auto dark:block" />
          </div>
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-control border-l-2 px-3 py-2.5 text-sm font-medium",
                    active
                      ? "border-clay bg-card text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
          <Separator className="my-6" />
          <TenantSwitcher />
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-11 w-full justify-start gap-2"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("common.signOut")}
          </Button>
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold text-clay">{t("common.appName")}</span>
    </div>
  );
}
