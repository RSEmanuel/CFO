import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import { Azeret_Mono, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Cifra · CFO virtual",
  description: "Cifra · CFO virtual. Tus cifras, en claro.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${manrope.variable} ${azeretMono.variable} font-sans antialiased tracking-[-0.01em]`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
