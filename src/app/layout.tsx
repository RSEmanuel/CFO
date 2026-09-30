import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500"] });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500"],
  style: ["normal", "italic"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "CFO Virtual",
  description: "Portal financiero multi-inquilino",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${fraunces.variable} font-sans antialiased tracking-[-0.01em]`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
