import type { ReactNode } from "react";

// El DashboardDataProvider (full-dashboard) ya no envuelve todo /dashboard:
// lo montan solo las vistas que lo consumen (Destacados y Métricas).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
