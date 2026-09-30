"use client";

import { FavoritesProvider } from "@/context/FavoritesContext";
import { LocaleProvider } from "@/context/LocaleContext";
import { SessionProvider } from "@/context/SessionContext";
import { Toaster } from "@/components/ui/sonner";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LocaleProvider>
        <FavoritesProvider>
          {children}
          <Toaster />
        </FavoritesProvider>
      </LocaleProvider>
    </SessionProvider>
  );
}
