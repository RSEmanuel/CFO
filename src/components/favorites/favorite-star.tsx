"use client";

import { useFavorites } from "@/context/FavoritesContext";
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
  const active = kind === "metric" ? isFavoriteMetric(id) : isFavoriteChart(id);

  return (
    <button
      type="button"
      aria-label={active ? `Quitar ${label} de favoritos` : `Marcar ${label} como favorito`}
      aria-pressed={active}
      className="rounded-full p-1 text-gray-300 transition-colors hover:text-amber-400"
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
      <Star className={cn("h-4 w-4", active && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
