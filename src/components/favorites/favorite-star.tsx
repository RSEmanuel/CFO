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
      className="rounded-full p-1 text-muted-foreground transition-colors hover:text-primary"
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
      <Star className={cn("h-4 w-4", active && "fill-primary text-primary")} />
    </button>
  );
}
