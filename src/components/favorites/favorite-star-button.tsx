"use client";

import { useFavorites } from "@/context/FavoritesContext";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { getFavoritableWidget } from "@/services/favoritesRegistry";
import { Star } from "lucide-react";

/**
 * Estrella de favoritos para widgets de módulos (KPIs, gráficos, tablas)
 * registrados en favoritesRegistry. Va en la cabecera superior derecha del
 * card; detiene la propagación para no interferir con clics de la tarjeta.
 */
export function FavoriteStarButton({
  widgetId,
  label,
  className,
}: {
  widgetId: string;
  label?: string;
  className?: string;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { t } = useLocale();
  const active = isFavorite(widgetId);
  const resolvedLabel = label ?? getFavoritableWidget(widgetId)?.titleKey ?? widgetId;
  const translatedLabel = label ?? t(resolvedLabel);

  return (
    <button
      type="button"
      aria-label={active ? t("favorites.remove", { label: translatedLabel }) : t("favorites.add", { label: translatedLabel })}
      aria-pressed={active}
      title={active ? t("favorites.remove", { label: translatedLabel }) : t("favorites.add", { label: translatedLabel })}
      className={cn(
        "shrink-0 rounded-full p-1 transition-all",
        active
          ? "text-amber-400"
          : "text-muted-foreground/40 hover:scale-110 hover:text-amber-400",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(widgetId);
      }}
    >
      <Star className={cn("h-4 w-4", active && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
