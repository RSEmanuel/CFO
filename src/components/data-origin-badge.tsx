"use client";

import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import type { DataOrigin } from "@/services/periodOrigins";

type DataOriginBadgeProps = {
  origin: DataOrigin | null | undefined;
  className?: string;
};

export function DataOriginBadge({ origin, className }: DataOriginBadgeProps) {
  const { t } = useLocale();
  if (!origin) {
    return null;
  }
  const isContpaqi = origin === "contpaqi";
  return (
    <span
      title={t(isContpaqi ? "dataOrigin.contpaqiHelp" : "dataOrigin.seedHelp")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        isContpaqi
          ? "border-category-marginsFg/25 bg-category-margins text-category-marginsFg"
          : "border-category-efficiencyFg/25 bg-category-efficiency text-category-efficiencyFg",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isContpaqi ? "bg-category-marginsFg" : "bg-category-efficiencyFg",
        )}
      />
      {t(isContpaqi ? "dataOrigin.contpaqi" : "dataOrigin.seed")}
    </span>
  );
}
