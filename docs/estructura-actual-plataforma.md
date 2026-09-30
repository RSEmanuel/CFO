# CFO Virtual — Estructura Actual de la Plataforma

> Documento de referencia para compartir con otros modelos de IA (p. ej. Gemini) o con el equipo.
> Describe los módulos, opciones, KPIs y gráficos que **actualmente existen** en la plataforma.
> Fecha de generación: septiembre 2026.

---

## 1. Resumen General

**CFO Virtual** es una plataforma web de CFO virtual / inteligencia financiera para PyMEs mexicanas. Ingiere archivos Excel contables (Balanza de Comprobación, Auxiliares, Pólizas y Flujo de Efectivo de CONTPAQi, o una Plantilla Máster propia) y genera dashboards ejecutivos, un catálogo de 50 métricas financieras, proyecciones de presupuesto y herramientas de auditoría.

**Stack técnico:**
- Frontend: Next.js 14 (App Router) + React 18 + TailwindCSS + Radix UI + next-intl (ES/EN)
- Gráficos: Recharts + Apache ECharts
- Backend: API Routes de Next.js + Prisma 7 sobre PostgreSQL (multi-tenant)
- Auth: AWS Cognito (JWT) con roles `ADMIN`, `CFO_PARTNER`, `CLIENT_VIEWER`
- Exportación: jsPDF, html-to-image, ExcelJS (Excel/CSV)
- Forecast: modelos propios (Seasonal Naïve, Holt-Winters) en `src/services/forecast/`

---

## 2. Navegación Principal (Sidebar)

| # | Módulo | Ruta | Acceso |
|---|--------|------|--------|
| 1 | **Resultados** | `/dashboard/overview` | Todos |
| 2 | **Posición Financiera** | `/dashboard/posicion-financiera` | Todos |
| 3 | **Flujo** | `/dashboard/flujo` | Todos |
| 4 | **Cobranza** | `/dashboard/cobranza` | Todos |
| 5 | **Métricas** (catálogo) | `/dashboard/metrics` | Todos |
| 6 | **Ingesta** | `/ingesta` | Solo ADMIN / CFO_PARTNER |
| 7 | **Configuración** | `/dashboard/settings` | Todos (sección cuenta) |

Elementos globales del sidebar: selector de empresa (TenantSwitcher, multi-tenant), colapso del menú, cierre de sesión.

**Rutas legacy** (existen pero redirigen a `/dashboard/overview`): `/dashboard/pnl`, `/dashboard/cashflow`, `/dashboard/commercial`, `/dashboard/working-capital`. Sus componentes (`module-pnl`, `module-cashflow`, `module-commercial`, `module-working-capital`) ya no se montan como páginas; solo sobreviven como métricas favoritables dentro del catálogo.

---

## 3. Módulo 1 — Resultados (`/dashboard/overview`)

Estado de resultados ejecutivo (P&L). Es la página principal de la plataforma.

### Barra de filtros
- **Temporalidad:** Mes / Trimestre / Año
- **Periodo:** selector mes-año
- **Comparable:** Año anterior (YoY) / Mes anterior (MoM)
- **Divisa:** MXN / USD
- **Unidades:** exactas / K / M
- **Análisis:** Monto ($) / Porcentaje (%)

### Tabs y su contenido

#### Tab "Destacados"
- Menú **"Personalizar vista"** con toggles para mostrar/ocultar secciones: KPIs principales, gráfico de tendencia, Top 5, Desglose COGS, Flujo operativo y capital de trabajo.
- Botón **"Paquete del mes"** (exportación PDF).
- **KPIs principales:** Ingreso, Costo, Gasto, EBITDA (cada uno con delta vs comparable).
- Sistema de **favoritos** (estrellas) conectado al catálogo de métricas.
- **Gráficos/bloques:**
  - Líneas: tendencia mensual **Ingresos vs Costos**, con etiquetas abreviadas (ingreso arriba, costo abajo; halo blanco). Con 24 meses no se pintan las 48 etiquetas: ingreso cada 2 meses (+ extremos) y costo solo en picos/valles (+ extremos).
  - Ranking apilado 24m: **Top 5 clientes** y **Top 5 líneas de negocio**. La participación usa el **universo auxiliar del mes**, no el KPI de ingreso: clientes = Σ cargos de hojas de cliente del auxiliar; líneas = Σ (haber − debe) de hojas 4xx. Resto = totalAuxiliar − ΣTop5 (≥ 0). El total sobre la barra es ese universo. Puede diferir del ingreso neto del P&L (devoluciones/7xx) y de Concentración & Riesgo (esa vista suma también saldos pendientes sin actividad del mes).
  - **Waterfall del Estado de Resultados:** Ingreso → Costos → Utilidad Bruta → Gastos → Resultado de operación → D&A → EBITDA.
  - **Desglose COGS** (barras horizontales): Materia prima, Mano de obra, Maquilas, GIF, Otros.
  - **Widget Flujo y Capital:** Flujo de caja libre, Cash runway, Ciclo de conversión de efectivo.

#### Tabs "Ingreso" / "Costo" / "Gasto"
- **5 KPIs por rubro:** Promedio 3M, Mes anterior, Año anterior, Trimestre anterior, Presupuesto oficial (o Proyección del mes).
- Headline del rubro con variación MoM/YoY.
- **Ingreso:** gráfico de línea (total + breakdown), Top 5, pie **"Desglose del ingreso"**, y *deep dive* (barras por categoría actual vs anterior, tabla con DIF$ y DIF%, comparativo Mensual vs Promedio 3M).
- **Costo:** barras apiladas, tarjeta **"Análisis COGS"** (tabla + stacked % de Directo/Indirecto/Utilidad bruta; modos: % de ventas / $ MXN / Ambos), gráfico **"Costo vs ingreso"** (MoM / Q vs Q / Año vs año).
- **Gasto:** barras apiladas + mismos KPIs de categoría.

#### Tab "Estado Operativo"
- Toggle de vista: % de ventas / $ MXN / Ambos.
- **Tabla formal del Estado de Resultados** con filas: Ventas netas, Costo de ventas, Utilidad bruta, Gastos de venta y generales, Gastos de administración, Depreciación y amortización, Otros gastos operativos, Total gastos operativos, Utilidad de operación (EBIT), (+) D&A, EBITDA, RIF, Productos/Gastos financieros, RAII, PTU, ISR, Utilidad neta.
- Columnas: Acumulado YTD, Mes actual, Mes anterior, Variación.
- **Drill-down a pólizas** por cuenta (auditoría).

#### Tab "Presupuesto"
- Controles: horizonte **3 / 6 / 12 meses**, escenario **Base / Conservador / Estirado**, slider de ajuste de ingresos ±10%, formulario de **drivers** (crecimiento de ventas, inflación, empleados, intereses, depreciación).
- Gráfico de línea/área: **"Ingreso: historial y proyección"** con bandas de confianza (P20/P50/P80).
- Tablas: Real / Presupuesto oficial / Proyección / Δ vs oficial / Rango; **P&L proyectado** (Trimestre / Semestre / Año).
- Motor de forecast: Seasonal Naïve y Holt-Winters aditivo (selección automática por MAPE con holdout de 3 periodos).

#### Tab "Otras cuentas"
- Placeholder (panel vacío, en construcción).

---

## 4. Módulo 2 — Posición Financiera (`/dashboard/posicion-financiera`)

Balance General multi-año + Estado de Resultados YTD + razones financieras + balanza de comprobación.

### Tabs y opciones
- **Estado de posición:** árbol de cuentas del Balance — Activo (corto/largo plazo), Pasivo (corto/largo plazo), Capital (social, reservas, resultados acumulados, resultado del ejercicio) con validación de la identidad A = P + C.
- **Estado de resultados:** árbol YTD — Ingresos netos, Costos, Gastos operativos, D&A, financieros, impuestos, Utilidad bruta / EBIT / neta.
- **Razones:** Liquidez, Actividad, Rentabilidad, Apalancamiento.
- **Balanza:** Saldo inicial, Cargos, Abonos, Saldo final por cuenta.

### Controles
- Selector de **Año** y **Periodo** (periodo solo aplica a Balanza).
- Botones: Actualizar, Contraer/Expandir todo, Mostrar filas vacías, columnas de comparación **YoY**.
- **Drill-down de auditoría** por cuenta (sheet lateral con movimientos de pólizas).

> Este módulo es tabular (tablas árbol expandibles); no usa tarjetas KPI ni gráficos.

---

## 5. Módulo 3 — Flujo (`/dashboard/flujo`)

Tesorería y flujo de efectivo. Usa la misma barra de filtros que Resultados.

### Tabs y contenido

#### Tab "Flujo de efectivo"
- Checkbox **"Excluir traspasos"**.
- **Sankey de Origen y Aplicación** (ingresos → Caja → egresos) o **Waterfall**: Saldo inicial / Ingresos / Egresos / Saldo final.

#### Tab "Resumen"
- **Alertas automáticas:** runway < 6 semanas, 2 meses consecutivos de flujo neto negativo, CapEx > 50% del flujo de operación.
- Gráfico de tendencia **Flujo de efectivo neto** (línea/barras, vista Mes/Trimestre).
- Waterfall de Entradas/Salidas operativas, CapEx y Servicio de deuda.

#### Tab "Operación / Inversión / Financiamiento" (Actividades)
- 3 tarjetas con barras históricas y comparativos vs mes/año anterior para cada actividad del flujo.

#### Tab "Operativo"
- KPIs: Entradas, Salidas, Flujo neto, Caja al cierre.
- **Gráfico compuesto diario** por categoría: cobranza, préstamos, traspasos, nómina, proveedores, renta/servicios, impuestos, pago de deuda, otros.

---

## 6. Módulo 4 — Cobranza (`/dashboard/cobranza`)

Cartera de cuentas por cobrar/pagar y antigüedad de saldos (aging).

### Sección Cartera
- Tabs: **Cuentas por Cobrar (Clientes)** / **Cuentas por Pagar (Proveedores)**.
- Controles: moneda, búsqueda, ordenamiento.
- **KPIs CxC:** Total Cartera Pendiente, Cobrado en el Mes, Facturación Nueva del Mes.
- **KPIs CxP:** Total Deuda a Proveedores, Pagado en el Mes, Nuevas Compras del Mes.
- Tabla de saldos por cliente/proveedor.

### Sección Antigüedad (aging)
- Toggle Por cobrar / Por pagar. Exportación a Excel/CSV.
- **KPIs:** Facturas pendientes de cobro, Días promedio para cobrar, Cartera > 60 días, Top cliente.
- **Gráficos de barras:** Antigüedad de cartera y Antigüedad de saldos con buckets: Corriente, 1–30, 31–60, 61–90, 90+ días.

---

## 7. Módulo 5 — Métricas / Catálogo (`/dashboard/metrics`)

Catálogo completo de **50 métricas financieras** con tarjetas estilo "Monthly.app" (fondo de color por categoría, badge, valor grande, pill de variación).

### Tabs de categorías
**Destacados** · Márgenes · Retorno · Eficiencia · Liquidez · Solvencia · Gestión

### Barra de filtros
Temporalidad (Mes/Trimestre/Año) · Periodo · Comparable (YoY/MoM) · Divisa (MXN/USD) · Unidades (exactas/K/M) · Análisis ($/%).

### Destacados por defecto (8)
Margen EBITDA, Margen Neto, ROIC, ROE, Rotación de Activos, Razón Circulante, Apalancamiento Operativo, Crecimiento de Ingresos. (Si el usuario marca favoritos con estrella, Destacados muestra sus favoritos.)

### Las 50 métricas

**Márgenes (#1–8):** Margen Bruto, Margen EBITDA, Margen Neto, Margen NOPAT, Margen Operativo, Margen de Flujo Operativo (OCF), Margen de Flujo Libre (FCF), Tasa Efectiva de Impuestos.

**Retorno (#9–15):** ROIC, ROCE, ROE, ROA, GMROI, RONIC, ROIC de Caja.

**Eficiencia (#16–24):** Rotación de Activos, Rotación de Cartera, Rotación de Inventario, Rotación de Proveedores, Rotación de Capital Invertido, Capital de Trabajo a Ingresos, CapEx a Ingresos, Gastos Operativos a Ingresos, D&A a Ingresos.

**Liquidez (#25–33):** Razón Circulante, Prueba Ácida, Razón de Efectivo, Días de Caja (Cash Runway), Eficiencia de Caja, Ciclo de Conversión de Efectivo (CCE), Días de Cobro (DSO), Días de Pago (DPO), Días de Inventario (DIO).

**Solvencia (#34–41):** Cobertura de Intereses, Deuda Neta a EBITDA, Apalancamiento Financiero, Razón de Pasivos, Razón de Deuda, Costo de la Deuda, Apalancamiento Operativo, Deuda a Ingresos.

**Gestión (#42–50):** Puntaje Clave, Impulsor de Valor, Crecimiento de Ingresos, Crecimiento de EBITDA, WACC, Costo de Capital Propio, Spread Económico, Margen del Accionista, Pago de Dividendos.

---

## 8. Módulo 6 — Ingesta (`/ingesta`) — solo ADMIN / CFO_PARTNER

Carga de archivos Excel con flujo **upload → detect → commit**:

1. **Dropzone** para `.xlsx` / `.xlsm`.
2. **Detección automática** (fingerprint + scoring) del tipo de documento y perfil.
3. **Preview** con contadores (cuentas, ventas, egresos, tesorería, movimientos auxiliares) y warnings.
4. **Confirmar y guardar** (commit) con opción de usar el periodo detectado del archivo; selector de perfil si el mapeo es ambiguo.

**Tipos de documento soportados:**
- Plantilla Máster (workbook multi-hoja: balanza_pnl, auxiliar_ventas, auxiliar_egresos, tesoreria_flujo)
- Balanza de Comprobación CONTPAQi (Compac)
- Flujo de Efectivo CONTPAQi (reporte de tesorería)
- Auxiliar de Cuentas CONTPAQi (movimientos por cuenta)
- Impreso de Diarios y Pólizas CONTPAQi
- Auxiliares de Clientes/Proveedores (cartera CxC/CxP)

---

## 9. Módulo 7 — Configuración (`/dashboard/settings`)

- Selector de **idioma** (Español / English).
- Información de sesión.
- **Alta de empresa** (tenant): nombre + RFC.
- **Alta de usuario**: correo, contraseña, rol (CFO Partner / Client Viewer).
- (Altas restringidas a ADMIN / CFO_PARTNER.)

---

## 10. Modelo de Datos (Prisma / PostgreSQL, multi-tenant)

| Modelo | Contenido |
|--------|-----------|
| **Tenant** | Empresa cliente (nombre, RFC único) |
| **User** | Usuario (email, cognitoSub, rol, tenant) |
| **BalanzaPnL** | Mayor contable por cuenta/periodo/año: saldos, debe/haber, categoría maestra, presupuesto, D&A |
| **AuxiliarVentas** | Facturas de venta: cliente, folio, fechas, montos, estatus de pago, línea de negocio |
| **AuxiliarEgresos** | Documentos de egreso: proveedor, folio, montos, clasificación de gasto, tipo de inversión, estatus |
| **TesoreriaFlujo** | Saldos por banco/caja y periodo: entradas, salidas, CapEx, servicio de deuda |
| **TesoreriaFlujoDetalle** | Movimientos de tesorería por categoría (ingreso/egreso, esTraspaso) |
| **AuxiliarMovimiento / AuxiliarCuentaResumen** | Movimientos del auxiliar de cuentas y resúmenes por cuenta/moneda |
| **Poliza / PolizaMovimiento** | Pólizas contables con partida doble |
| **BudgetAssumption** | Drivers de presupuesto por año (crecimiento, inflación, headcount, intereses, depreciación) |
| **IngestMappingProfile** | Perfiles de mapeo de columnas (builtin o por tenant) |
| **IngestBatch / IngestFileAudit** | Auditoría de cargas (SHA256, filas, warnings, errores) |

---

## 11. API Endpoints (resumen)

**Auth:** `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/register-user`
**Tenants/Health:** `GET|POST /api/tenants` · `GET /api/health`
**Ingesta:** `POST /api/ingest/detect` · `POST /api/ingest/commit` · `POST /api/ingest/upload`
**Métricas:** `/api/metrics` (hero) · `catalog` (50 métricas) · `full-dashboard` · `available-periods` · `resultados` · `resultados-top5` · `resultados-cogs` · `estado-operativo` · `posicion-financiera` · `flujo` · `flujo-efectivo` · `flujo-operativo` · `cobranza` · `cobranza/cartera` · `budget-projection` · `budget-assumptions` (GET/PUT)
**Auditoría:** `GET /api/polizas/by-account` (drill-down de movimientos por cuenta)

---

## 12. Capacidades analíticas del motor financiero

- **50 métricas** del catálogo (ver sección 7), calculadas por `financialEngine` con deltas MoM/YoY.
- **DuPont:** margen neto × rotación × apalancamiento → ROA → ROE.
- **Capital de trabajo:** DSO, DIO, DPO, CCC, NWC.
- **Flujo operativo** por categorías (cobranza, nómina, proveedores, impuestos, deuda, etc.).
- **Aging de cartera** con buckets Corriente / 1–30 / 31–60 / 61–90 / 90+.
- **Forecast de presupuesto:** Seasonal Naïve y Holt-Winters aditivo (s=12), selección por MAPE (holdout 3), horizonte 12 meses, intervalos P20/P50/P80, escenarios base/conservador/estirado y overlay de drivers manuales.
- **Validaciones:** identidad contable A = P + C, consistencia YTD, pólizas descuadradas, alerta de déficit patrimonial.

---

*Nota: las rutas `/dashboard/pnl`, `/dashboard/cashflow`, `/dashboard/commercial` y `/dashboard/working-capital` existen en el código pero redirigen a Resultados; su funcionalidad fue absorbida por los módulos activos descritos arriba.*
