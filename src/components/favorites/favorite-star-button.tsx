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
        "touch-hit absolute right-3 top-3 z-10 shrink-0 rounded-full p-1 text-[color:var(--cifra-warn)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(widgetId);
      }}
    >
      <Star strokeWidth={2} className={cn("h-6 w-6", active && "fill-[color:var(--cifra-warn)]")} />
    </button>
  );
}
