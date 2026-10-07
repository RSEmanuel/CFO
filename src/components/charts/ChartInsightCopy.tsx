"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import { toast } from "sonner";

type ChartInsightCopyProps = {
  frase: string;
  chartName: string;
  empresa: string;
  periodo: string;
};

export function ChartInsightCopy({ frase, chartName, empresa, periodo }: ChartInsightCopyProps) {
  const { t } = useLocale();
  const copy = async () => {
    const payload = `${frase}\n${chartName} · ${empresa} · ${periodo}\nCifra`;
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(t("charts.copied"));
    } catch {
      return;
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
      onClick={() => void copy()}
    >
      {t("charts.copyInsight")}
    </Button>
  );
}
