"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ACCOUNT_NAV, isNavActive, PRIMARY_NAV, visibleNav, type AppNavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CifraMark } from "@/components/brand/CifraMark";

const STORAGE_KEY = "cfo.sidebarCollapsed";

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: AppNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const Icon = item.icon;
  const active = isNavActive(pathname, item.href);
  const label = t(item.labelKey);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={() => router.prefetch(item.href)}
      className={cn(
        "flex items-center gap-2 rounded-control border-l-2 py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "border-clay bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { user, logout } = useSession();
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  const primary = visibleNav(PRIMARY_NAV, user?.role);
  const account = visibleNav(ACCOUNT_NAV, user?.role);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-beige-deep bg-chrome py-4 transition-all duration-300 lg:flex",
          collapsed ? "w-16 px-2" : "w-[240px] px-3",
        )}
      >
        <div className={cn("mb-4 flex", collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex h-9 w-9 items-center justify-center rounded-control text-primary">
                  <CifraMark state="confirmed" size={24} blink />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{t("common.appName")}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/cifra-lockup.svg" alt={t("common.appName")} className="h-7 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/cifra-lockup-dark.svg" alt={t("common.appName")} className="hidden h-7 w-auto dark:block" />
              <p className="mt-1 truncate text-xs text-muted-foreground">{t("common.executivePortal")}</p>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t("common.expandMenu") : t("common.collapseMenu")}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {primary.map((item) => (
            <NavItemLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <Separator className="my-3" />
        <div className="flex flex-col gap-1">
          {account.map((item) => (
            <NavItemLink key={item.href} item={item} collapsed={collapsed} />
          ))}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-full text-muted-foreground"
                  onClick={logout}
                  aria-label={t("common.signOut")}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("common.signOut")}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="justify-start gap-2 text-muted-foreground"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              {t("common.signOut")}
            </Button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
