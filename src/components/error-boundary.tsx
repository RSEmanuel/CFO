"use client";

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale } from "@/i18n/config";
import { createT } from "@/i18n/translate";
import { reportClientError } from "@/lib/report-client-error";
import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { hasError: boolean };

/** Va por fuera de los providers: lee el idioma guardado directamente, sin LocaleContext. */
function fallbackT() {
  let locale = DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocale(stored)) {
      locale = stored;
    }
  } catch {
    // Sin acceso a localStorage se queda el idioma por defecto.
  }
  return createT(locale);
}

/**
 * Error boundary global del portal: registra el error en el panel de errores y muestra una
 * pantalla para recargar en lugar de dejar la página en blanco.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
    reportClientError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const t = fallbackT();
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-card border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]">
          <p className="font-sans text-lg font-medium text-foreground">{t("errors.boundary.title")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("errors.boundary.message")}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            {t("errors.boundary.reload")}
          </button>
        </div>
      </main>
    );
  }
}
