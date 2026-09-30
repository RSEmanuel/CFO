"use client";

import { buildFlujoAlertas, type FlujoMensual } from "@/services/flujoTransformer";
import { useLocale } from "@/context/LocaleContext";
import { useMemo } from "react";

const ESPRESSO = "#1A1915";

export function FlujoAlertas({ periodo, rows }: { periodo: string; rows: FlujoMensual[] }) {
  const { t } = useLocale();
  const alerts = useMemo(() => buildFlujoAlertas(rows, periodo), [rows, periodo]);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {alerts.map((alert) => (
        <li
          key={alert.messageKey}
          className="inline-flex items-center gap-2 rounded-full border border-beige-deep px-3 py-1.5 text-[13px]"
          style={{ color: ESPRESSO }}
        >
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
          {t(alert.messageKey, alert.values)}
        </li>
      ))}
    </ul>
  );
}
