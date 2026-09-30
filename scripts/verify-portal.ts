import "dotenv/config";

/**
 * Verificación del portal (verif. 6) contra el dev server en localhost:3000
 * con dev-bypass de auth como compac.partner@cfo.mx (tenant Compac).
 * Uso: npx tsx scripts/verify-portal.ts
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

async function main(): Promise<void> {
  const checks: Check[] = [];

  // available-periods
  const periods = await get("/api/metrics/available-periods");
  const periodsData = unwrap(periods.body);
  const available: string[] = periodsData?.availablePeriods ?? [];
  checks.push({
    name: "available-periods status",
    ok: periods.status === 200,
    detail: `HTTP ${periods.status}`,
  });
  checks.push({
    name: "available-periods 24 periodos",
    ok: available.length === 24,
    detail: `${available.length} periodos: ${available[0]} … ${available.at(-1)}`,
  });
  checks.push({
    name: "latestPeriod = 2026-07",
    ok: periodsData?.latestPeriod === "2026-07",
    detail: `latestPeriod=${periodsData?.latestPeriod}`,
  });

  // full-dashboard
  const dashboard = await get("/api/metrics/full-dashboard?periodo=7&anio=2026");
  const dashData = unwrap(dashboard.body);
  checks.push({
    name: "full-dashboard status",
    ok: dashboard.status === 200,
    detail: `HTTP ${dashboard.status}${dashboard.status !== 200 ? " " + JSON.stringify(dashboard.body).slice(0, 300) : ""}`,
  });
  const mensual = dashData?.views?.mensual;
  const ytd = dashData?.views?.ytd;
  checks.push({
    name: "full-dashboard vistas mensual+ytd",
    ok: Boolean(mensual && ytd),
    detail: `mensual=${Boolean(mensual)} ytd=${Boolean(ytd)}`,
  });

  // estado-operativo con comparativo MoM real (jun-2026 vs jul-2026)
  const er = await get("/api/metrics/estado-operativo?periodo=2026-07");
  const erData = unwrap(er.body);
  const erNeta = erData?.filas?.find((f: any) => f.key === "utilidadNeta");
  checks.push({
    name: "estado-operativo status",
    ok: er.status === 200,
    detail: `HTTP ${er.status}`,
  });
  checks.push({
    name: "ER YTD jul-2026 = -822,603.62",
    ok: erNeta?.acumulado?.monto != null && Math.abs(erNeta.acumulado.monto - -822603.62) < 0.01,
    detail: `YTD=${erNeta?.acumulado?.monto}`,
  });
  checks.push({
    name: "ER MoM real (mesAnterior jun-2026 poblado)",
    ok: erData?.periodoAnterior === "2026-06" && erNeta?.mesAnterior?.monto != null,
    detail: `periodoAnterior=${erData?.periodoAnterior} netaMesAnterior=${erNeta?.mesAnterior?.monto} netaMesActual=${erNeta?.mesActual?.monto}`,
  });

  // posicion-financiera: árbol con columnas 2024/2025/2026
  const posicion = await get("/api/metrics/posicion-financiera?anio=2026&periodo=7");
  const posData = unwrap(posicion.body);
  const years: number[] = posData?.years ?? [];
  checks.push({
    name: "posicion-financiera status",
    ok: posicion.status === 200,
    detail: `HTTP ${posicion.status}`,
  });
  checks.push({
    name: "árbol columnas 2024/2025/2026",
    ok: [2024, 2025, 2026].every((y) => years.includes(y)),
    detail: `years=${JSON.stringify(years)}`,
  });

  // catalog
  const catalog = await get("/api/metrics/catalog?periodo=7&anio=2026&comparable=mom");
  const catData = unwrap(catalog.body);
  const catCount = catData?.categories ? Object.keys(catData.categories).length : 0;
  checks.push({
    name: "catalog status",
    ok: catalog.status === 200 && catCount > 0,
    detail: `HTTP ${catalog.status} categorías=${catCount}`,
  });

  // dupont
  const dupont = await get("/api/metrics/dupont?periodo=2026-07");
  checks.push({
    name: "dupont status",
    ok: dupont.status === 200,
    detail: `HTTP ${dupont.status}${dupont.status !== 200 ? " " + JSON.stringify(dupont.body).slice(0, 300) : ""}`,
  });

  // tendencias 12m: resultados-top5 usa trailingMonths(…, 12) → lineasSeries/clientesSeries
  const top5 = await get("/api/metrics/resultados-top5?periodo=2026-07");
  const top5Data = unwrap(top5.body);
  const lineasSeries = top5Data?.lineasSeries;
  const trendMonths: any[] = lineasSeries?.months ?? [];
  const trendTotal: number[] = lineasSeries?.total ?? [];
  const trendNonZero = trendTotal.filter((v) => Math.abs(v) > 0.005).length;
  checks.push({
    name: "resultados-top5 status",
    ok: top5.status === 200,
    detail: `HTTP ${top5.status}`,
  });
  checks.push({
    name: "tendencias 12m pobladas (lineasSeries)",
    ok: trendMonths.length === 12 && trendTotal.length === 12 && trendNonZero === 12,
    detail: `meses=${trendMonths.length} total.length=${trendTotal.length} no-cero=${trendNonZero} rango=${trendMonths[0]?.key}…${trendMonths.at(-1)?.key} fuenteClientes=${top5Data?.fuenteClientes ?? "null"}`,
  });

  console.log("== VERIFICACIÓN PORTAL (HTTP real contra localhost:3000) ==\n");
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
