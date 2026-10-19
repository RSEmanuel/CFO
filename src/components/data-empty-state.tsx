"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import { useEffect, type ReactNode } from "react";

export function DataEmptyState({
  title,
  message,
  description,
  action,
}: {
  title: string;
  message: string;
  description?: string | null;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  const desc = description === undefined ? t("emptyStates.noSource") : description;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {desc ? <CardDescription>{desc}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}

/**
 * Falla de carga: mensaje fijo en llano que termina en verbo y botón Reintentar.
 * El detalle del error solo va a la consola (el API ya lo registra en el servidor).
 */
export function DataErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    if (error) {
      console.error("DataErrorState", error);
    }
  }, [error]);
  return (
    <DataEmptyState
      title={title}
      message={t("errors.loadRetry")}
      description={null}
      action={
        <Button type="button" variant="outline" onClick={onRetry ?? (() => window.location.reload())}>
          {t("common.retry")}
        </Button>
      }
    />
  );
}
