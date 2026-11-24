"use client";

import {
  AntiguedadCard,
  ClientesQueNoPaganCard,
  SaldosPorClienteCard,
} from "@/components/cobranza/AntiguedadCards";
import { CobranzaAgingChart } from "@/components/cobranza/CobranzaAgingChart";
import { CobranzaCarteraSection } from "@/components/cobranza/CobranzaCarteraSection";
import { ConcentracionRiesgoSection } from "@/components/cobranza/ConcentracionRiesgoSection";
import { DataEmptyState, DataErrorState } from "@/components/data-empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/context/LocaleContext";
import { useCobranza } from "@/hooks/use-cobranza";
import { cn } from "@/lib/utils";
import { formatAxisTick } from "@/services/money";
import { useState } from "react";

type CobranzaTab = "cartera" | "antiguedad" | "concentracion";

const COBRANZA_TABS: Array<{ value: CobranzaTab; labelKey: string }> = [
  { value: "cartera", labelKey: "cobranza.tabs.cartera" },
  { value: "antiguedad", labelKey: "cobranza.tabs.antiguedad" },
  { value: "concentracion", labelKey: "cobranza.tabs.concentracion" },
];

export function CobranzaPage() {
  const { t } = useLocale();
  const { data, loading, error } = useCobranza();
  const [tab, setTab] = useState<CobranzaTab>("cartera");
  if (loading) return <div className="h-96 animate-pulse rounded-card bg-secondary" />;
  const model = data?.model ?? null;
  const asOf = data?.asOf ?? null;

  return (
    <div className="mx-auto w-full max-w-[1680px] bg-background">
      <Tabs value={tab} onValueChange={(value) => setTab(value as CobranzaTab)}>
        <div>
          <p className="mb-2 text-2xl font-medium tracking-tight text-clay">{t("nav.collections")}</p>
          <TabsList className="flex h-auto flex-nowrap justify-start gap-2 overflow-x-auto border-0 bg-transparent p-0 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {COBRANZA_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "rounded-full border-0 bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-none",
                  "hover:bg-muted/80 hover:text-foreground",
                  "data-[state=active]:border-0 data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:shadow-none",
                )}
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="cartera" className="mt-4">
          <CobranzaCarteraSection />
        </TabsContent>

        <TabsContent value="antiguedad" className="mt-4">
      <div className="space-y-4">
      {error ? <DataErrorState title={t("cobranza.loadError")} error={error} /> : null}
      {!error && data && !data.hasData ? (
        <DataEmptyState title={t("cobranza.emptyTitle")} message={t("cobranza.emptyMessage")} />
      ) : null}
      <ClientesQueNoPaganCard />
      {model && asOf ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-sans text-lg font-medium text-foreground">{t("cobranza.pendingInvoices")}</p>
          <p className="text-xs text-muted-foreground">{t("cobranza.outstanding")}</p>
          <p className="financial-nums mt-4 text-3xl font-medium tracking-tight text-foreground">
            {formatAxisTick(model.cxcAbierta, "m")}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-sans text-lg font-medium text-foreground">{t("cobranza.averageDays")}</p>
          <p className="text-xs text-muted-foreground">{t("cobranza.averageDaysHelp")}</p>
          <p className="financial-nums mt-4 text-3xl font-medium tracking-tight text-foreground">{model.dso == null ? t("common.na") : t("cobranza.days", { value: model.dso })}</p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-sans text-lg font-medium text-foreground">{t("cobranza.over60")}</p>
          <p className="financial-nums mt-4 text-3xl font-medium tracking-tight text-foreground">
            {model.pctMayor60.toFixed(1)}%
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="font-sans text-lg font-medium text-foreground">{t("cobranza.topClient")}</p>
          <p className="mt-4 font-sans text-2xl font-medium tracking-tight text-foreground">
            {model.topCliente.nombre} · {model.topCliente.pct.toFixed(0)}%
          </p>
        </article>
      </div>
      ) : null}

      {model && asOf ? <CobranzaAgingChart /> : null}

      <AntiguedadCard />

      <SaldosPorClienteCard />
      </div>
        </TabsContent>

        <TabsContent value="concentracion" className="mt-4">
          <ConcentracionRiesgoSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
