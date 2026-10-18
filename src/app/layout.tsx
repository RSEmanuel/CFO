import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import { Cormorant_Garamond, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

const fontVars = `${cormorant.variable} ${dmSans.variable} ${plexMono.variable}`;

export const metadata: Metadata = {
  title: "Cifra · CFO virtual",
  description: "Cifra · CFO virtual. Tus cifras, en claro.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={fontVars} suppressHydrationWarning>
      <body className={`${fontVars} font-sans antialiased tracking-[-0.01em]`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
