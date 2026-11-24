"use client";

import { TendenciaIngresosCostosChart } from "@/components/dashboard/TendenciaIngresosCostosChart";
import { presentarNombre } from "@/services/textoPresentable";
import { useLocale } from "@/context/LocaleContext";
import { useCajaRespiro } from "@/hooks/use-caja-respiro";
import { useCobranza } from "@/hooks/use-cobranza";
import { useEstadoOperativo } from "@/hooks/use-estado-operativo";
import { usePanelSaldos } from "@/hooks/use-panel-saldos";
import { cn } from "@/lib/utils";
import type { MonthlyFinancials } from "@/services/financialDataTransformer";
import { formatMxn, type DisplayUnits } from "@/services/money";
import { buildPortadaMes, type PortadaAlerta, type PortadaMes as Portada, type PortadaSello } from "@/services/portadaMes";
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

function desplazarPeriodo(periodo: string, meses: number): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) return "";
  const total = anio * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Ventas del mismo mes del año pasado y EBITDA de los últimos 12 meses, de la serie de resultados (PyG oficial). */
function deLaSerie(rows: MonthlyFinancials[], periodo: string) {
  const anioAnterior = desplazarPeriodo(periodo, -12);
  const ventasAnioAnterior = rows.find((row) => row.periodo === anioAnterior)?.ingreso_total ?? null;
  const ventana = rows.filter((row) => row.periodo > anioAnterior && row.periodo <= periodo);
  const ebitda12m = ventana.length
    ? { monto: ventana.reduce((acc, row) => acc + row.ebitda, 0), meses: ventana.length }
    : null;
  return { ventasAnioAnterior, ebitda12m };
}

function alertaTexto(alerta: PortadaAlerta, t: T): string {
  switch (alerta.kind) {
    case "lowRunway":
      return t("flujo.alertsMessages.lowRunway", { caja: formatMxn(alerta.caja), meses: alerta.meses.toFixed(1) });
    case "clienteSuspender":
      return t("cobranza.noPagan.alerta", { cliente: presentarNombre(alerta.cliente), monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "clienteRevisar":
      return t("cobranza.sinCobrar.alerta", { cliente: presentarNombre(alerta.cliente), monto: formatMxn(alerta.monto), dias: alerta.dias });
    case "perdida":
      return t("control.portada.alertas.perdida", { monto: formatMxn(alerta.monto) });
    case "gastoSube":
      return t("control.portada.alertas.gastoSube", { pct: alerta.pct.toFixed(1), monto: formatMxn(alerta.monto) });
    case "deudaAlta":
      return t("control.portada.alertas.deudaAlta", { anios: alerta.anios.toFixed(1) });
    case "deudaSinOperacion":
      return t("control.portada.alertas.deudaSinOperacion", { monto: formatMxn(alerta.monto) });
  }
}

type Tarjeta = {
  key: string;
  label: string;
  valor: string;
  detalle: string;
  /** Sello del dato: confirmado (balanza), estimado (Cifra calculó) o sin dato. */
  sello: PortadaSello;
  href: string;
};

function variacion(actual: number | null, base: number | null): string | null {
  if (actual == null || base == null || Math.abs(base) < 0.01) return null;
  const pct = ((actual - base) / Math.abs(base)) * 100;
  return `${pct > 0.05 ? "+" : pct < -0.05 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
}

function tarjetasResultado(portada: Portada, t: T): Tarjeta[] {
  const na = t("common.na");
  const comparaciones = [
    variacion(portada.ventas, portada.ventasAnterior),
    variacion(portada.ventas, portada.ventasAnioAnterior),
  ];
  const ventasDetalle = [
    comparaciones[0] ? t("control.portada.ventas.vsMes", { pct: comparaciones[0] }) : null,
    comparaciones[1] ? t("control.portada.ventas.vsAnio", { pct: comparaciones[1] }) : null,
  ].filter(Boolean);
  const margen = portada.margenPct;
  return [
    {
      key: "ventas",
      label: t("control.portada.ventas.label"),
      valor: portada.ventas == null ? na : formatMxn(portada.ventas),
      detalle:
        portada.ventas == null
          ? t("control.portada.ventas.sinDato")
          : ventasDetalle.length
            ? ventasDetalle.join(" · ")
            : t("control.portada.ventas.sinComparar"),
      sello: portada.ventas == null ? "missing" : "confirmed",
      href: "/dashboard/overview",
    },
    {
      key: "utilidad",
      label: t("control.portada.utilidad.label"),
      valor: portada.utilidad == null ? na : formatMxn(portada.utilidad),
      detalle:
        portada.utilidad == null
          ? t("control.portada.utilidad.sinDato")
          : margen == null
            ? t("control.portada.utilidad.sinAnterior")
            : margen >= 0
              ? t("control.portada.margen.gana", { monto: Math.round(margen) })
              : t("control.portada.margen.pierde", { monto: Math.round(-margen) }),
      sello: portada.utilidad == null ? "missing" : "confirmed",
      href: "/dashboard/overview?tab=estado-resultados",
    },
  ];
}

function tarjetasDinero(portada: Portada, t: T): Tarjeta[] {
  const na = t("common.na");
  const deuda = portada.deudaPago;
  return [
    {
      key: "caja",
      label: t("control.portada.caja.label"),
      valor: portada.caja == null ? na : formatMxn(portada.caja),
      detalle:
        portada.caja == null
          ? t("control.portada.caja.sinDato")
          : portada.mesesDeRespiro == null
            ? t("control.portada.caja.fuente")
            : t("control.portada.cajaRespiro", { meses: portada.mesesDeRespiro.toFixed(1) }),
      sello: portada.caja == null ? "missing" : portada.mesesDeRespiro == null ? "confirmed" : "estimated",
      href: "/dashboard/flujo",
    },
    {
      key: "cxc",
      label: t("control.portada.cxc.label"),
      valor: portada.cxc == null ? na : formatMxn(portada.cxc),
      detalle:
        portada.cxc == null
          ? t("control.portada.cxc.sinDato")
          : portada.dso == null
            ? t("control.portada.cxc.sinDias")
            : t("control.portada.cxc.dias", { dias: portada.dso }),
      sello: portada.cxc == null ? "missing" : portada.dso == null ? "confirmed" : "estimated",
      href: "/dashboard/cobranza",
    },
    {
      key: "cxp",
      label: t("control.portada.cxp.label"),
      valor: portada.cxp == null ? na : formatMxn(portada.cxp),
      detalle:
        portada.cxp == null
          ? t("control.portada.cxp.sinDato")
          : portada.dpo == null
            ? t("control.portada.cxp.sinDias")
            : t("control.portada.cxp.dias", { dias: portada.dpo }),
      sello: portada.cxp == null ? "missing" : portada.dpo == null ? "confirmed" : "estimated",
      href: "/dashboard/cobranza",
    },
    {
      key: "deuda",
      label: t("control.portada.deuda.label"),
      valor: portada.deuda == null ? na : formatMxn(portada.deuda),
      detalle:
        portada.deuda == null
          ? t("control.portada.deuda.sinDeuda")
          : deuda.estado === "anios"
            ? t("control.portada.deuda.anios", { anios: deuda.anios.toFixed(1) })
            : deuda.estado === "cajaCubre"
              ? t("control.portada.deuda.cajaCubre")
              : deuda.estado === "sinOperacion"
                ? t("control.portada.deuda.sinOperacion")
                : t("control.portada.deuda.sinDato"),
      sello: portada.deuda == null ? "missing" : deuda.estado === "anios" ? "estimated" : "confirmed",
      href: "/dashboard/posicion-financiera",
    },
    {
      key: "impuestos",
      label: t("control.portada.impuestos.label"),
      valor: portada.impuestos == null ? na : formatMxn(portada.impuestos.total),
      detalle:
        portada.impuestos == null
          ? t("control.portada.impuestos.sinDato")
          : portada.impuestos.ivaPorCobrar > 0.01
            ? t("control.portada.impuestos.ivaPorCobrar", { monto: formatMxn(portada.impuestos.ivaPorCobrar) })
            : t("control.portada.impuestos.detalle"),
      sello: portada.impuestos == null ? "missing" : "confirmed",
      href: "/dashboard/posicion-financiera",
    },
  ];
}

function TarjetaPortada({ tarjeta, grande = false }: { tarjeta: Tarjeta; grande?: boolean }) {
  const { t } = useLocale();
  return (
    <Link
      href={tarjeta.href}
      className="rounded-control border border-border bg-background p-4 transition-colors hover:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs font-medium text-muted-foreground">{tarjeta.label}</p>
      <p
        className={cn(
          "cifra-num mt-2 font-semibold tracking-tight text-foreground",
          grande ? "text-3xl" : "text-2xl xl:text-base 2xl:text-lg",
          tarjeta.sello === "missing" && "text-muted-foreground",
        )}
      >
        {tarjeta.valor}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {tarjeta.sello === "estimated" ? <span className="font-medium">{t("control.portada.sello.estimada")} · </span> : null}
        {tarjeta.detalle}
      </p>
    </Link>
  );
}

function Seccion({ titulo }: { titulo: string }) {
  return <h3 className="mt-5 font-mono text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{titulo}</h3>;
}

/**
 * Portada del Panel de Control: cómo te fue (ventas y utilidad), tu dinero
 * (caja, lo que te deben, lo que debes a proveedores, deuda e impuestos), qué
 * hacer (máximo 3 alertas) y la tendencia de 12 meses. Cada cifra con su sello
 * (confirmada o estimada) y el clic a su módulo. La lógica vive en services/portadaMes.
 */
export function PortadaMes({ periodo, rows, units }: { periodo: string; rows: MonthlyFinancials[]; units: DisplayUnits }) {
  const { t, locale } = useLocale();
  const estado = useEstadoOperativo(periodo);
  const caja = useCajaRespiro(periodo);
  const cobranza = useCobranza();
  const saldos = usePanelSaldos(periodo);
  const serie = useMemo(() => deLaSerie(rows, periodo), [rows, periodo]);

  const portada = useMemo(
    () =>
      buildPortadaMes({
        estado: estado.data,
        caja: caja.data,
        cobranza: cobranza.data,
        saldos: saldos.data,
        ventasAnioAnterior: serie.ventasAnioAnterior,
        ebitda12m: serie.ebitda12m,
      }),
    [estado.data, caja.data, cobranza.data, saldos.data, serie],
  );

  if (estado.loading || caja.loading || cobranza.loading || saldos.loading) {
    return <div className="h-72 animate-pulse rounded-card bg-secondary" />;
  }
  const sinNada = portada.ventas == null && portada.utilidad == null && portada.caja == null && portada.cxc == null;
  if (!periodo || sinNada) {
    return null;
  }

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
  if (portada.dso != null && portada.dpo != null) {
    frases.push(
      t(portada.dpo >= portada.dso ? "control.portada.financiamiento.proveedores" : "control.portada.financiamiento.clientes", {
        dso: portada.dso,
        dpo: portada.dpo,
      }),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-sans text-xl font-bold tracking-tight text-foreground">
          {t("control.portada.titulo", { mes: nombreDelMes(periodo, locale) })}
        </h2>
        {frases.length > 0 ? <p className="mt-1 text-sm text-foreground">{frases.join(" ")}</p> : null}

        <Seccion titulo={t("control.portada.seccion.comoTeFue")} />
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {tarjetasResultado(portada, t).map((tarjeta) => (
            <TarjetaPortada key={tarjeta.key} tarjeta={tarjeta} grande />
          ))}
        </div>

        <Seccion titulo={t("control.portada.seccion.tuDinero")} />
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {tarjetasDinero(portada, t).map((tarjeta) => (
            <TarjetaPortada key={tarjeta.key} tarjeta={tarjeta} />
          ))}
        </div>

        {portada.alertas.length > 0 ? (
          <>
            <Seccion titulo={t("control.portada.seccion.queHacer")} />
            <ul className="mt-2 space-y-2">
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
          </>
        ) : null}
      </section>

      {rows.length > 0 ? <TendenciaIngresosCostosChart rows={rows} units={units} endPeriod={periodo} /> : null}
    </div>
  );
}
