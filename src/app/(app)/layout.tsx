import { AuthGate } from "@/components/auth-gate";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex h-screen w-full overflow-hidden bg-chrome">
        <Sidebar />
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-chrome">
          <MobileNav />
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto bg-background">
            <div className="p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
