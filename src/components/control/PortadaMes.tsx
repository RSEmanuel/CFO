"use client";

import { useLocale } from "@/context/LocaleContext";
import { useCajaRespiro } from "@/hooks/use-caja-respiro";
import { useCobranza } from "@/hooks/use-cobranza";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { formatMxn } from "@/services/money";
import { buildPortadaMes, type PortadaAlerta, type PortadaSello } from "@/services/portadaMes";
import Link from "next/link";
import { useMemo } from "react";

type T = (key: string, values?: Record<string, string | number>) => string;

function nombreDelMes(periodo: string, locale: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) {
    return periodo;
  }
  const nombre = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio, mes - 1, 1)),
  );
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function alertaTexto(alerta: PortadaAlerta, t: T): string {
  switch (alerta.kind) {
    case "lowRunway":
      return t("flujo.alertsMessages.lowRunway", { caja: formatMxn(alerta.caja), meses: alerta.meses.toFixed(1) });
    case "clienteSuspender":
      return t("cobranza.noPagan.alerta", { cliente: alerta.cliente, monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "clienteRevisar":
      return t("cobranza.sinCobrar.alerta", { cliente: alerta.cliente, monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "perdida":
      return t("control.portada.alertas.perdida", { monto: formatMxn(alerta.monto) });
    case "gastoSube":
      return t("control.portada.alertas.gastoSube", { pct: alerta.pct.toFixed(1), monto: formatMxn(alerta.monto) });
  }
}

type Tarjeta = {
  key: string;
  label: string;
  valor: string;
  detalle: string;
  sello: PortadaSello;
  href: string;
};

/**
 * B05. "Tu mes en 5 números": utilidad, tu caja, meses de respiro, clientes y
 * gasto, cada cifra con su sello (confirmada, estimada o sin dato) y el clic a
 * su módulo. Solo junta cifras que ya existen; la lógica vive en services/portadaMes.
 */
export function PortadaMes({ periodo }: { periodo: string }) {
  const { t, locale } = useLocale();
  const estado = useEstadoOperativo(periodo);
  const caja = useCajaRespiro(periodo);
  const cobranza = useCobranza();

  const portada = useMemo(
    () => buildPortadaMes({ estado: estado.data, caja: caja.data, cobranza: cobranza.data }),
    [estado.data, caja.data, cobranza.data],
  );

  if (estado.loading || caja.loading || cobranza.loading) {
    return <div className="h-56 animate-pulse rounded-card bg-secondary" />;
  }
  const sinNada =
    portada.utilidad == null && portada.caja == null && portada.clientes == null && portada.gasto == null;
  if (!periodo || sinNada) {
    return null;
  }

  const na = t("common.na");
  const frases: string[] = [];
  if (portada.ventas != null && portada.utilidad != null) {
    frases.push(
      portada.utilidad >= 0
        ? t("control.portada.frase.ventasUtilidad", { ventas: formatMxn(portada.ventas), utilidad: formatMxn(portada.utilidad) })
        : t("control.portada.frase.ventasPerdida", { ventas: formatMxn(portada.ventas), perdida: formatMxn(-portada.utilidad) }),
    );
  }
  if (portada.mesesDeRespiro != null) {
    frases.push(t("control.portada.frase.respiro", { meses: portada.mesesDeRespiro.toFixed(1) }));
  }

  const gastoDetalle = (() => {
    const gasto = portada.gasto;
    if (!gasto || gasto.variacionPct == null) {
      return t("control.portada.gasto.sinAnterior");
    }
    const pct = Math.abs(gasto.variacionPct).toFixed(1);
    if (Math.abs(gasto.variacionPct) < 0.05) {
      return t("control.portada.gasto.igual");
    }
    return gasto.variacionPct > 0 ? t("control.portada.gasto.mas", { pct }) : t("control.portada.gasto.menos", { pct });
  })();

  const tarjetas: Tarjeta[] = [
    {
      key: "utilidad",
      label: t("control.portada.utilidad.label"),
      valor: portada.utilidad == null ? na : formatMxn(portada.utilidad),
      detalle:
        portada.utilidad == null
          ? t("control.portada.utilidad.sinDato")
          : portada.utilidadAnterior == null
            ? t("control.portada.utilidad.sinAnterior")
            : t("control.portada.utilidad.anterior", { monto: formatMxn(portada.utilidadAnterior) }),
      sello: portada.utilidad == null ? "missing" : "confirmed",
      href: "/dashboard/overview",
    },
    {
      key: "caja",
      label: t("control.portada.caja.label"),
      valor: portada.caja == null ? na : formatMxn(portada.caja),
      detalle: portada.caja == null ? t("control.portada.caja.sinDato") : t("control.portada.caja.fuente"),
      sello: portada.caja == null ? "missing" : "confirmed",
      href: "/dashboard/flujo",
    },
    {
      key: "respiro",
      label: t("control.portada.respiro.label"),
      valor: portada.mesesDeRespiro == null ? na : t("common.months", { value: portada.mesesDeRespiro.toFixed(1) }),
      detalle: portada.mesesDeRespiro == null ? t("control.portada.respiro.sinDato") : t("control.portada.respiro.fuente"),
      sello: portada.mesesDeRespiro == null ? "missing" : "estimated",
      href: "/dashboard/flujo",
    },
    {
      key: "clientes",
      label: portada.clientes?.base === "sinCobrar" ? t("cobranza.sinCobrar.title") : t("cobranza.noPagan.title"),
      valor: portada.clientes == null ? na : formatMxn(portada.clientes.monto),
      detalle:
        portada.clientes == null
          ? t("control.portada.clientes.sinDato")
          : portada.clientes.base === "vencido"
            ? t("control.portada.clientes.vencido")
            : t("control.portada.clientes.sinCobrar"),
      sello: portada.clientes == null ? "missing" : portada.clientes.base === "vencido" ? "confirmed" : "estimated",
      href: "/dashboard/cobranza",
    },
    {
      key: "gasto",
      label: t("control.portada.gasto.label"),
      valor: portada.gasto == null ? na : formatMxn(portada.gasto.actual),
      detalle: portada.gasto == null ? t("control.portada.gasto.sinDato") : gastoDetalle,
      sello: portada.gasto == null ? "missing" : "confirmed",
      href: "/dashboard/overview",
    },
  ];

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-sans text-xl font-bold tracking-tight text-foreground">
        {t("control.portada.titulo", { mes: nombreDelMes(periodo, locale) })}
      </h2>
      {frases.length > 0 ? <p className="mt-1 text-sm text-foreground">{frases.join(" ")}</p> : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {tarjetas.map((tarjeta) => (
          <Link
            key={tarjeta.key}
            href={tarjeta.href}
            className="rounded-control border border-border bg-background p-4 transition-colors hover:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-xs font-medium text-muted-foreground">{tarjeta.label}</p>
            <p className="cifra-num mt-2 text-2xl font-semibold tracking-tight text-foreground xl:text-base 2xl:text-lg">{tarjeta.valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tarjeta.sello === "estimated" ? (
                <span className="font-medium">{t("control.portada.sello.estimada")} · </span>
              ) : null}
              {tarjeta.detalle}
            </p>
          </Link>
        ))}
      </div>

      {portada.alertas.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {portada.alertas.map((alerta, index) => (
            <li
              key={`${alerta.kind}-${index}`}
              className="flex items-start gap-2 rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground"
            >
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-desfavorable" aria-hidden />
              {alertaTexto(alerta, t)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
