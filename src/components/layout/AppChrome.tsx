"use client";

import { Header } from "@/components/header";
import { ClientPreviewBanner } from "@/components/layout/ClientPreviewBanner";
import { ExampleTenantBanner } from "@/components/layout/ExampleTenantBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** La prueba visual trae su propio marco. El resto del portal conserva el actual. */
function isLaboratorio(pathname: string): boolean {
  return pathname === "/dashboard/laboratorio" || pathname.startsWith("/dashboard/laboratorio/");
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isLaboratorio(pathname)) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <ClientPreviewBanner />
      <ExampleTenantBanner />
        <ExampleTenantBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-chrome">
      <ClientPreviewBanner />
      <ExampleTenantBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <Sidebar />
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-chrome">
          <MobileNav />
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto bg-background">
            <div className="p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
