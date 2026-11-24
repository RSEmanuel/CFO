"use client";

import { CifraMark } from "@/components/brand/CifraMark";
import { LabLogo } from "@/components/laboratorio/LabLogo";
import "@/components/laboratorio/laboratorio-theme.css";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { ACCOUNT_NAV, isNavActive, PRIMARY_NAV, visibleNav, type AppNavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/services/financialDataTransformer";
import { Eye, EyeOff, LogOut, Menu, PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "cfo.lab.sidebarCollapsed";

type NavGroup = { label: string; items: AppNavItem[] };

function labControlItem(item: AppNavItem): AppNavItem {
  if (item.href !== "/dashboard/control") {
    return item;
  }
  return { ...item, href: "/dashboard/laboratorio" };
}

function useLabNav(): NavGroup[] {
  const { effectiveRole } = useSession();
  const { t } = useLocale();
  const primary = visibleNav(PRIMARY_NAV, effectiveRole).map(labControlItem);
  const byHref = new Map(primary.map((item) => [item.href, item]));
  const pick = (hrefs: string[]) => hrefs.flatMap((href) => (byHref.has(href) ? [byHref.get(href)!] : []));

  return [
    {
      label: t("laboratorio.groups.month"),
      items: pick(["/dashboard/laboratorio", "/dashboard/overview", "/dashboard/posicion-financiera"]),
    },
    {
      label: t("laboratorio.groups.money"),
      items: pick(["/dashboard/flujo", "/dashboard/cobranza"]),
    },
    {
      label: t("laboratorio.groups.reading"),
      items: pick(["/dashboard/metrics", "/ingesta", "/control-cargas", "/dashboard/que-paso", "/dashboard/settings/errores"]),
    },
    { label: t("laboratorio.groups.account"), items: visibleNav(ACCOUNT_NAV, effectiveRole) },
  ].filter((group) => group.items.length > 0);
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: AppNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();
  const Icon = item.icon;
  const active = item.href === "/dashboard/laboratorio" ? pathname.startsWith(item.href) : isNavActive(pathname, item.href);
  const label = t(item.labelKey);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed && "justify-center px-0",
        active ? "bg-[var(--lab-bg)] font-bold text-[var(--lab-brand)]" : "text-[var(--lab-nav-text)] hover:bg-[var(--lab-bg)] hover:text-[var(--lab-navy)]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
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

function SidebarBody({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const groups = useLabNav();
  const { logout, user } = useSession();
  const { t } = useLocale();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center", collapsed ? "justify-center px-2 py-4" : "px-4 py-4")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/laboratorio"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common.appName")}
              >
                <CifraMark state="confirmed" size={24} blink />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t("common.appName")}</TooltipContent>
          </Tooltip>
        ) : (
          <Link href="/dashboard/laboratorio" className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LabLogo />
            <p className="mt-1 truncate text-xs text-muted-foreground">{t("common.executivePortal")}</p>
          </Link>
        )}
      </div>

      <div className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
        <TenantSwitcher collapsed={collapsed} />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {collapsed ? null : (
              <p className="px-3 pb-1 text-[11px] font-medium uppercase leading-4 tracking-wider text-[var(--lab-nav-text)]">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-border p-3", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground"
                onClick={logout}
                aria-label={t("common.signOut")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("common.signOut")}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-[var(--lab-bg)] text-[11px] font-bold text-[var(--lab-brand)]">{initials}</AvatarFallback>
            </Avatar>
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{user?.email ?? t("common.user")}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 text-muted-foreground"
              onClick={logout}
              aria-label={t("common.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LaboratorioShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { user, canClientPreview, isClientPreviewMode, toggleClientPreviewMode, tenants, tenantId, activePeriod } = useSession();
  const companyName = tenants.find((item) => item.id === tenantId)?.name ?? t("common.company");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

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

  function onTogglePreview(): void {
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
    <TooltipProvider delayDuration={200}>
      <div className="lab-theme flex h-full min-h-0 bg-[var(--lab-bg)] text-[var(--lab-navy)] lg:gap-4 lg:p-4">
        <aside
          className={cn(
            "hidden h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[20px] bg-card shadow-[var(--lab-shadow)] transition-[width] duration-300 motion-reduce:transition-none lg:flex",
            collapsed ? "w-[4.5rem]" : "w-[290px]",
          )}
        >
          <SidebarBody collapsed={collapsed} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 rounded-[20px] bg-card px-3 shadow-[var(--lab-shadow)] md:px-4">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:hidden" aria-label={t("common.openMenu")}>
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="lab-theme w-72 border-border bg-card p-0">
                <SidebarBody collapsed={false} onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-11 w-11 lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("common.expandMenu") : t("common.collapseMenu")}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="mx-1 hidden h-4 lg:block" />
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--lab-nav-text)]">{activePeriod ? periodLabel(activePeriod) : t("common.na")}</p>
              <p className="truncate text-base font-bold text-[var(--lab-navy)]">{companyName}</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-10 rounded-full border-[var(--lab-brand)] font-bold text-[var(--lab-brand)] hover:bg-[var(--lab-bg)]">
                <Link href="/dashboard/control">{t("laboratorio.back")}</Link>
              </Button>
              {canClientPreview ? (
                <button
                  type="button"
                  onClick={onTogglePreview}
                  aria-pressed={isClientPreviewMode}
                  aria-label={isClientPreviewMode ? previewLabel : t("clientPreview.enterAria")}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isClientPreviewMode
                      ? "bg-primary text-primary-foreground ring-primary"
                      : "bg-card text-foreground ring-border hover:text-primary",
                  )}
                >
                  {isClientPreviewMode ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  <span className="hidden sm:inline">{previewLabel}</span>
                </button>
              ) : null}
              <Avatar className="h-9 w-9" aria-label={t("common.sessionOf", { email: user?.email ?? t("common.user") })}>
                <AvatarFallback className="bg-[var(--lab-bg)] text-[11px] font-bold text-[var(--lab-brand)]">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <main className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
