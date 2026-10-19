"use client";

import { FavoriteStar } from "@/components/favorites/favorite-star";
import { InsightText } from "@/components/insight-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { Maximize2, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

const ChartExpandedContext = createContext(false);

/** true cuando la tarjeta de gráfica que envuelve al componente está ampliada. */
export function useChartExpanded(): boolean {
  return useContext(ChartExpandedContext);
}

/**
 * Contenedor de la gráfica dentro de una tarjeta ampliable: usa su alto normal (p. ej. h-80) y,
 * con la tarjeta ampliada, llena el espacio libre. Úsalo cuando la gráfica no es el hijo directo
 * del contenido de la tarjeta (p. ej. una columna de KPIs junto a la gráfica).
 */
export function ChartBody({
  heightClass = "h-80",
  className,
  children,
}: {
  heightClass?: string;
  className?: string;
  children: ReactNode;
}) {
  const expanded = useChartExpanded();
  return <div className={cn(expanded ? "min-h-0 flex-1" : heightClass, className)}>{children}</div>;
}

/**
 * Estado y efectos de la ampliación: Escape cierra, bloquea el scroll del body, la cruz recibe el
 * foco al abrir y el botón de ampliar lo recupera al cerrar. Lo usan ExpandableChartCard y las
 * tarjetas que arman su propio Card con ExpandableShell.
 */
function useExpandable() {
  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);

  const open = useCallback(() => {
    setPlaceholderHeight(cardRef.current?.offsetHeight ?? 0);
    setExpanded(true);
  }, []);
  const close = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) {
      if (wasExpanded.current) {
        expandButtonRef.current?.focus();
        wasExpanded.current = false;
      }
      return;
    }
    wasExpanded.current = true;
    collapseButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return { expanded, open, close, placeholderHeight, cardRef, expandButtonRef, collapseButtonRef };
}

type Expandable = ReturnType<typeof useExpandable>;

function ExpandToggle({ state }: { state: Expandable }) {
  const { t } = useLocale();
  return state.expanded ? (
    <Button
      ref={state.collapseButtonRef}
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={t("charts.collapse")}
      onClick={state.close}
    >
      <X className="h-4 w-4" aria-hidden />
    </Button>
  ) : (
    <Button
      ref={state.expandButtonRef}
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={t("charts.expand")}
      onClick={state.open}
    >
      <Maximize2 className="h-4 w-4" aria-hidden />
    </Button>
  );
}

/**
 * Card ampliable. La misma tarjeta pasa a position fixed (no es un modal nuevo ni la Fullscreen
 * API), así la gráfica no se desmonta y ResponsiveContainer se redimensiona solo. Mientras está
 * ampliada deja un hueco del mismo alto para que la página de atrás no salte.
 *
 * !m-0 anula el margen que los space-y-* del padre le ponen a los hijos; w-auto/h-auto anulan un
 * w-full o alto fijo que traiga className, para que manden los inset.
 *
 * z-50, el mismo nivel que sheet/select/tooltip: los popovers que Radix porta al body quedan
 * encima de la tarjeta ampliada (van después en el DOM) y la tarjeta queda encima del header (z-30).
 */
export const ExpandableShell = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    /** Recibe el botón de ampliar/cerrar para colocarlo como última acción del header. */
    children: (toggle: ReactNode, expanded: boolean) => ReactNode;
  }
>(function ExpandableShell({ className, children }, ref) {
  const state = useExpandable();
  useImperativeHandle(ref, () => state.cardRef.current as HTMLDivElement);
  const { expanded } = state;

  return (
    <ChartExpandedContext.Provider value={expanded}>
      {expanded ? (
        <>
          <div aria-hidden style={{ height: state.placeholderHeight }} />
          <div className="fixed inset-0 z-50 !m-0 bg-foreground/40" aria-hidden onClick={state.close} />
        </>
      ) : null}
      <Card
        ref={state.cardRef}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? true : undefined}
        className={cn(
          // relative ancla la estrella de favoritos a la esquina; ampliada, fixed ya posiciona la tarjeta.
          !expanded && "relative",
          className,
          expanded &&
            "fixed inset-3 z-50 !m-0 flex h-auto w-auto max-w-none flex-col overflow-auto shadow-[var(--shadow-md)] sm:inset-6 lg:inset-x-20 lg:inset-y-12",
        )}
      >
        {children(<ExpandToggle state={state} />, expanded)}
      </Card>
    </ChartExpandedContext.Provider>
  );
});

export type ExpandableChartCardProps = {
  /** Con id se muestra la estrella de favoritos (kind "chart"). */
  id?: string;
  title: ReactNode;
  /** Qué mide la gráfica, en lenguaje de negocio. Bajo el título. */
  insightText?: string;
  heightClass?: string;
  /** Acciones extra del header (descarga, info, toggles). El botón de ampliar va siempre al final. */
  actions?: ReactNode;
  /** Contenido entre el header y la gráfica (leyendas, selectores). */
  headerExtra?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

export const ExpandableChartCard = forwardRef<HTMLDivElement, ExpandableChartCardProps>(function ExpandableChartCard(
  { id, title, insightText, heightClass = "h-80", actions, headerExtra, className, contentClassName, children },
  ref,
) {
  return (
    <ExpandableShell ref={ref} className={className}>
      {(toggle, expanded) => (
        <>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pr-10">
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <InsightText text={insightText} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              {id ? <FavoriteStar kind="chart" id={id} label={typeof title === "string" ? title : id} /> : null}
              {toggle}
            </div>
          </CardHeader>
          {headerExtra}
          <CardContent className={cn(expanded ? "min-h-0 flex-1" : heightClass, contentClassName)}>
            {children}
          </CardContent>
        </>
      )}
    </ExpandableShell>
  );
});
