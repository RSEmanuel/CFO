"use client";

import { toPng } from "html-to-image";
import { useLocale } from "@/context/LocaleContext";
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";

type UseChartDownloadOptions = {
  targetRef: RefObject<HTMLElement>;
  empresa: string;
  modulo: string;
  titulo: string;
  periodo: string;
};

function slugPart(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "sin-dato";
}

export function useChartDownload({
  targetRef,
  empresa,
  modulo,
  titulo,
  periodo,
}: UseChartDownloadOptions) {
  const { t } = useLocale();
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadLock = useRef(false);
  const filename = useMemo(
    () =>
      [empresa, modulo, titulo, periodo]
        .map(slugPart)
        .join("-")
        .concat(".png"),
    [empresa, modulo, titulo, periodo],
  );

  const download = useCallback(async () => {
    const target = targetRef.current;
    if (!target || downloadLock.current) {
      return;
    }

    downloadLock.current = true;
    setIsDownloading(true);
    const startedAt = Date.now();

    try {
      const dataUrl = await toPng(target, {
        backgroundColor: "#F1F3FB",
        pixelRatio: 2,
      });
      const anchor = document.createElement("a");
      anchor.download = filename;
      anchor.href = dataUrl;
      anchor.click();
    } catch {
      toast.error(t("charts.downloadFailed"));
    } finally {
      const remaining = Math.max(0, 1_000 - (Date.now() - startedAt));
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
      downloadLock.current = false;
      setIsDownloading(false);
    }
  }, [filename, targetRef, t]);

  return { download, filename, isDownloading };
}
