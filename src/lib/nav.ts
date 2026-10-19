import type { SessionUser } from "@/lib/session-types";
import { ERROR_VIEW_ROLES } from "@/auth/rbac";
import { Bug, BarChart3, ClipboardCheck, HandCoins, LayoutDashboard, LineChart, Scale, type LucideIcon, Settings, Upload, Wallet } from "lucide-react";

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
  { href: "/ingesta", labelKey: "nav.ingest", icon: Upload, roles: ["ADMIN", "CFO_PARTNER"] },
  // Control interno: historial de cargas, mismos roles que Ingesta.
  { href: "/control-cargas", labelKey: "nav.loadControl", icon: ClipboardCheck, roles: ["ADMIN", "CFO_PARTNER"] },
  // Errores del portal: diagnóstico para el equipo, no para clientes.
  { href: "/dashboard/settings/errores", labelKey: "nav.errorLog", icon: Bug, roles: ERROR_VIEW_ROLES },
];

export const ACCOUNT_NAV: AppNavItem[] = [
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
];

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Activo si la ruta cae bajo el ítem, salvo que otro ítem más específico también coincida
 * (p. ej. /dashboard/settings/errores marca "Errores del portal", no "Configuración").
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (!matchesPath(pathname, href)) {
    return false;
  }
  return ![...PRIMARY_NAV, ...ACCOUNT_NAV].some(
    (item) => item.href !== href && item.href.startsWith(`${href}/`) && matchesPath(pathname, item.href),
  );
}

export function visibleNav(items: AppNavItem[], role: SessionUser["role"] | undefined): AppNavItem[] {
  return items.filter((item) => {
    if (!item.roles) {
      return true;
    }
    return Boolean(role && item.roles.includes(role));
  });
}
