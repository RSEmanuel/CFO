"use client";

import { useCallback } from "react";
import { useLocale } from "@/context/LocaleContext";
import { nombreCuentaVisible } from "@/i18n/nombreVisible";

/** Nombre de cuenta listo para pantalla en el idioma activo (ver `nombreCuentaVisible`). */
export function useNombreCuenta(): (nombre: string, code?: string) => string {
  const { locale, t } = useLocale();
  return useCallback((nombre: string, code?: string) => nombreCuentaVisible(nombre, code, locale, t), [locale, t]);
}
