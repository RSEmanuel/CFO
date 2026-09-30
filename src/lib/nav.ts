import type { SessionUser } from "@/lib/session-types";
import { BarChart3, HandCoins, LayoutDashboard, LineChart, Scale, type LucideIcon, Settings, Sliders, Upload, Wallet } from "lucide-react";

export type AppNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  roles?: ReadonlyArray<SessionUser["role"]>;
};

/** Panel de Control primero (puesto de mando de favoritos); Resultados sigue con LineChart. */
export const PRIMARY_NAV: AppNavItem[] = [
  { href: "/dashboard/control", labelKey: "nav.control", icon: LayoutDashboard },
  { href: "/dashboard/overview", labelKey: "nav.results", icon: LineChart },
  { href: "/dashboard/posicion-financiera", labelKey: "nav.position", icon: Scale },
  { href: "/dashboard/flujo", labelKey: "nav.cashflow", icon: Wallet },
  { href: "/dashboard/cobranza", labelKey: "nav.collections", icon: HandCoins },
  { href: "/dashboard/metrics", labelKey: "nav.metrics", icon: BarChart3 },
  // Simulador What-If: herramienta analítica, junto al catálogo de métricas.
  { href: "/dashboard/simulator", labelKey: "nav.simulator", icon: Sliders },
  { href: "/ingesta", labelKey: "nav.ingest", icon: Upload, roles: ["ADMIN", "CFO_PARTNER"] },
];

export const ACCOUNT_NAV: AppNavItem[] = [
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
];

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function visibleNav(items: AppNavItem[], role: SessionUser["role"] | undefined): AppNavItem[] {
  return items.filter((item) => {
    if (!item.roles) {
      return true;
    }
    return Boolean(role && item.roles.includes(role));
  });
}
