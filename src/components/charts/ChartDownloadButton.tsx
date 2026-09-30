"use client";

import { useChartDownload } from "@/components/charts/useChartDownload";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/context/LocaleContext";
import { Download, Loader2 } from "lucide-react";
import type { RefObject } from "react";

type ChartDownloadButtonProps = {
  targetRef: RefObject<HTMLElement>;
  empresa: string;
  modulo: string;
  titulo: string;
  periodo: string;
};

export function ChartDownloadButton({
  targetRef,
  empresa,
  modulo,
  titulo,
  periodo,
}: ChartDownloadButtonProps) {
  const { t } = useLocale();
  const { download, isDownloading } = useChartDownload({
    targetRef,
    empresa,
    modulo,
    titulo,
    periodo,
  });

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label={t("charts.downloadPng")}
            disabled={isDownloading}
            onClick={() => void download()}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("charts.downloadPng")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
