"use client";

import { useCallback } from "react";
import { useLocale } from "@/context/LocaleContext";
import { etiquetaPeriodo } from "@/i18n/format";

/** «Ago-25» → «Aug-25» en inglés; en español queda igual. Para ejes, tooltips y encabezados. */
export function useEtiquetaPeriodo(): (label: unknown) => string {
  const { locale } = useLocale();
  return useCallback((label: unknown) => etiquetaPeriodo(String(label ?? ""), locale), [locale]);
}
