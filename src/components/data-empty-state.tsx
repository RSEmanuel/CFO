import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/LocaleContext";
import type { ReactNode } from "react";

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
