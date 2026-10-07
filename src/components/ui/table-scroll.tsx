"use client";

import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import { MoveHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Contenedor con scroll horizontal para tablas anchas. En pantallas menores a lg
 * muestra una pista de que la tabla se puede deslizar, solo si de verdad no cabe.
 */
export function TableScroll({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      {scrollable ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
          <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("common.swipeTable")}
        </p>
      ) : null}
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
