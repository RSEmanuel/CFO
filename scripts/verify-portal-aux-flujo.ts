import "dotenv/config";

/**
 * Verificación del portal tras la ingesta de auxiliares + flujos históricos,
 * contra el dev server en localhost:3000 con dev-bypass compac.partner.
 * Uso: npx tsx scripts/verify-portal-aux-flujo.ts
 */

const BASE = "http://localhost:3000";
const AUTH = "Bearer dev-bypass.dev-user:compac.partner@cfo.mx";

type Check = { name: string; ok: boolean; detail: string };

async function get(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: AUTH } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function unwrap(body: any): any {
  return body?.data ?? body;
}

function fmt(value: unknown): string {
  return typeof value === "number"
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  // ---- cobranza/cartera: forma literal pedida (periodo=2026-06 cae al fallback) ----
  const carteraLiteral = await get("/api/metrics/cobranza/cartera?periodo=2026-06");
  const clData = unwrap(carteraLiteral.body);
  checks.push({
    name: "cartera?periodo=2026-06 (literal) status",
    ok: carteraLiteral.status === 200,
    detail: `HTTP ${carteraLiteral.status}`,
  });
  checks.push({
    name: "cartera literal → fallback último periodo con items",
    ok: Boolean(clData?.hasData) && (clData?.clientes?.items?.length ?? 0) > 0,
    detail: `periodo servido=${clData?.anio}-${String(clData?.periodo).padStart(2, "0")} moneda=${clData?.moneda} clientes=${clData?.clientes?.items?.length} proveedores=${clData?.proveedores?.items?.length} pendienteCxC=${fmt(clData?.clientes?.totalPendiente)}`,
  });

  // ---- cobranza/cartera: meses históricos explícitos MXN ----
  for (const [anio, periodo] of [
    [2026, 6],
    [2025, 3],
    [2024, 8],
  ] as const) {
    const res = await get(`/api/metrics/cobranza/cartera?anio=${anio}&periodo=${periodo}`);
    const data = unwrap(res.body);
    checks.push({
      name: `cartera ${anio}-${String(periodo).padStart(2, "0")} MXN con items`,
      ok:
        res.status === 200 &&
        Boolean(data?.hasData) &&
        data?.anio === anio &&
        data?.periodo === periodo &&
        (data?.clientes?.items?.length ?? 0) > 0 &&
        (data?.proveedores?.items?.length ?? 0) > 0,
      detail: `HTTP ${res.status} clientes=${data?.clientes?.items?.length} proveedores=${data?.proveedores?.items?.length} CxC=${fmt(data?.clientes?.totalPendiente)} CxP=${fmt(data?.proveedores?.totalPendiente)} monedas=${JSON.stringify(data?.monedasDisponibles)}`,
    });
  }

  // ---- cobranza/cartera USD en meses históricos ----
  for (const [anio, periodo] of [
    [2026, 6],
    [2025, 12],
  ] as const) {
    const res = await get(`/api/metrics/cobranza/cartera?anio=${anio}&periodo=${periodo}&moneda=USD`);
    const data = unwrap(res.body);
    checks.push({
      name: `cartera ${anio}-${String(periodo).padStart(2, "0")} USD con items`,
      ok:
        res.status === 200 &&
        Boolean(data?.hasData) &&
        data?.moneda === "USD" &&
        (data?.clientes?.items?.length ?? 0) > 0,
      detail: `HTTP ${res.status} moneda=${data?.moneda} clientes=${data?.clientes?.items?.length} proveedores=${data?.proveedores?.items?.length} CxC USD=${fmt(data?.clientes?.totalPendiente)} CxP USD=${fmt(data?.proveedores?.totalPendiente)}`,
    });
  }

  // ---- resultados-top5: serie 12m de clientes alimentada por auxiliares reales ----
  const top5 = await get("/api/metrics/resultados-top5?periodo=2026-07");
  const top5Data = unwrap(top5.body);
  const clientesSeries = top5Data?.clientesSeries;
  const cMonths: any[] = clientesSeries?.months ?? [];
  const cTotal: number[] = clientesSeries?.total ?? [];
  const cNonZero = cTotal.filter((v) => Math.abs(v) > 0.005).length;
  checks.push({
    name: "resultados-top5 status",
    ok: top5.status === 200,
    detail: `HTTP ${top5.status}`,
  });
  checks.push({
    name: "clientesSeries 12m pobladas con auxiliares reales",
    ok: cMonths.length === 12 && cTotal.length === 12 && cNonZero === 12 && top5Data?.fuenteClientes === "resumen",
    detail: `meses=${cMonths.length} no-cero=${cNonZero}/12 rango=${cMonths[0]?.key}…${cMonths.at(-1)?.key} fuenteClientes=${top5Data?.fuenteClientes}`,
  });

  // ---- flujo-efectivo (Sankey) en meses históricos ----
  for (const periodo of ["2024-08", "2025-01", "2025-02", "2026-06", "2026-07"] as const) {
    const res = await get(`/api/metrics/flujo-efectivo?periodo=${periodo}`);
    const data = unwrap(res.body);
    const d = data?.data;
    checks.push({
      name: `flujo-efectivo ${periodo} con detalle Sankey`,
      ok:
        res.status === 200 &&
        data?.source === "detalle" &&
        (d?.ingresos?.length ?? 0) > 0 &&
        (d?.egresos?.length ?? 0) > 0 &&
        Math.abs((d?.saldoFinal ?? 0) - ((d?.disponible ?? 0) - (d?.totalEgresos ?? 0))) < 0.01,
      detail: `HTTP ${res.status} source=${data?.source} ingresos=${d?.ingresos?.length} egresos=${d?.egresos?.length} saldoFinal=${fmt(d?.saldoFinal)} traspasos=${fmt(d?.traspasos)}`,
    });
  }

  // ---- flujo agregado (tabla mensual) ----
  const flujo = await get("/api/metrics/flujo");
  const flujoData = unwrap(flujo.body);
  const flujoRows: any[] = flujoData?.rows ?? [];
  checks.push({
    name: "flujo (tabla) 24 periodos",
    ok: flujo.status === 200 && flujoRows.length === 24,
    detail: `HTTP ${flujo.status} rows=${flujoRows.length} primero=${flujoRows[0]?.periodo} último=${flujoRows.at(-1)?.periodo}`,
  });

  // ---- available-periods sigue en 24 ----
  const periods = await get("/api/metrics/available-periods");
  const periodsData = unwrap(periods.body);
  const available: string[] = periodsData?.availablePeriods ?? [];
  checks.push({
    name: "available-periods sigue 24",
    ok: periods.status === 200 && available.length === 24 && periodsData?.latestPeriod === "2026-07",
    detail: `HTTP ${periods.status} n=${available.length} latest=${periodsData?.latestPeriod}`,
  });

  // ---- ER YTD jul-2026 intacto ----
  const er = await get("/api/metrics/estado-operativo?periodo=2026-07");
  const erData = unwrap(er.body);
  const erNeta = erData?.filas?.find((f: any) => f.key === "utilidadNeta");
  checks.push({
    name: "ER YTD jul-2026 = -822,603.62 intacto",
    ok: er.status === 200 && erNeta?.acumulado?.monto != null && Math.abs(erNeta.acumulado.monto - -822603.62) < 0.01,
    detail: `HTTP ${er.status} YTD=${fmt(erNeta?.acumulado?.monto)} mesActual=${fmt(erNeta?.mesActual?.monto)}`,
  });

  console.log("== VERIFICACIÓN PORTAL AUXILIARES + FLUJOS (localhost:3000) ==\n");
  let failures = 0;
  for (const check of checks) {
    console.log(`  ${check.ok ? "OK  " : "FAIL"}  ${check.name}: ${check.detail}`);
    if (!check.ok) failures += 1;
  }
  console.log(`\n${checks.length - failures}/${checks.length} checks OK`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
