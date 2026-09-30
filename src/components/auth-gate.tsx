"use client";

import { useLocale } from "@/context/LocaleContext";
import { useSession } from "@/context/SessionContext";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loadingSession")}
      </div>
    );
  }

  return <>{children}</>;
}
