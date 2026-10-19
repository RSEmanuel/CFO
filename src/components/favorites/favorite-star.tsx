"use client";

import { useFavorites } from "@/context/FavoritesContext";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export function FavoriteStar({
  kind,
  id,
  label,
}: {
  kind: "metric" | "chart";
  id: string;
  label: string;
}) {
  const { isFavoriteMetric, isFavoriteChart, toggleFavoriteMetric, toggleFavoriteChart } = useFavorites();
  const { t } = useLocale();
  const active = kind === "metric" ? isFavoriteMetric(id) : isFavoriteChart(id);

  return (
    <button
      type="button"
      aria-label={active ? t("favorites.remove", { label }) : t("favorites.add", { label })}
      aria-pressed={active}
      className="absolute right-3 top-3 z-10 shrink-0 rounded-full p-1 text-[color:var(--cifra-warn)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (kind === "metric") {
          toggleFavoriteMetric(id);
        } else {
          toggleFavoriteChart(id);
        }
      }}
    >
      <Star strokeWidth={2} className={cn("h-6 w-6", active && "fill-[color:var(--cifra-warn)]")} />
    </button>
  );
}
