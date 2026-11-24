import { AuthGate } from "@/components/auth-gate";
import { AppChrome } from "@/components/layout/AppChrome";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppChrome>{children}</AppChrome>
    </AuthGate>
  );
}
