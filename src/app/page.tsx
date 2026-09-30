"use client";

import { ACCESS_TOKEN_KEY } from "@/lib/api";
import { isClientDevAuthBypass } from "@/lib/dev-flags";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    router.replace(token || isClientDevAuthBypass ? "/dashboard" : "/login");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Redirigiendo…
    </main>
  );
}
