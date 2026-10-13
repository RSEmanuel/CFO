# Auditoría de producto financiero — Cifra (octubre 2026)

## Contexto
El dueño de una PyME mediana mexicana mira el tablero unos 15 minutos al mes y no es contador. Esta auditoría responde tres preguntas: qué tan completa, clara y accionable es Cifra hoy para ese usuario; qué falta; y qué está construido pero no se ve. Es de solo lectura: revisé código, docs y textos de pantalla (`es.json`), sin tocar base de datos ni archivos de clientes. Se respetan AGENTS.md, CLAUDE.md y .cursorrules. El PyG oficial es `computeErBuckets` (`src/services/estadoOperativo.ts`).

Fecha: 13 de octubre de 2026. Las referencias `archivo:línea` corresponden al commit `a26d0e6`.

---

## 1. Resumen ejecutivo
- **¿Se puede confiar hoy? En parte.** El Estado de Resultados (tabs Estado de resultados y Estado Operativo) ya cuadra al centavo con el PyG oficial, con clic hasta la póliza de cada cuenta. Es el activo más fuerte.
- **Pero el mismo concepto da cifras distintas según la pantalla.**
  - Las tarjetas de Ingreso, Costo, Gasto y EBITDA, la tendencia y el "Paquete del mes" usan otra clasificación (`resultadosLedger.ts:52-63`, por `categoriaMaestra`): suman productos financieros (7xxx) a Ingreso y gastos financieros e impuestos (8xxx, 6405/6406) a Gasto. Por eso el "EBITDA" de la tarjeta incluye intereses e impuestos.
  - Hay 3 cálculos de días de cobro (DSO), 3 fuentes de caja y 3 fórmulas de meses de respiro.
- **Lo más útil para el dueño está construido pero no se ve en pantalla:**
  - alertas de caja (`FlujoAlertas.tsx`, nadie lo importa);
  - alerta de desviaciones de gasto (`gastoOpexService.ts:117-131`);
  - monitor de impuestos y cuentas puente (`rifAuditoria.ts`, solo lo usa un test);
  - sello de calidad del dato (`periodOrigins` y `dataOrigin.*`, nadie los usa);
  - tarjeta de presupuesto (`resultadosKpis.ts:25`).
- **Sin favoritos, el Panel de Control abre vacío** ("Tu Panel de Control está vacío").

**Las 3 acciones que más cambian la percepción de valor:**
1. **Una sola verdad por cifra.** Que el PyG oficial alimente las tarjetas, la tendencia y el PDF de Resultados, y que DSO, caja y meses de respiro tengan una definición cada uno.
2. **"Tu mes en 5 números" como portada del Panel de Control.** Utilidad, tu caja, meses de respiro, clientes que no te pagan y 3 acciones, usando las alertas que ya existen.
3. **Lista "Clientes que no te pagan"** con monto, días y siguiente paso, más el sello de cifra confirmada o estimada en cada KPI.

---

## 2. Mapa de cobertura
| Área | Módulo(s) | Claridad (1–5) | Completitud (1–5) | Nota |
|---|---|---|---|---|
| Rentabilidad y PyG | Resultados (6 tabs), Posición › Razones, Métricas | 3 | 4 | El ER oficial es sólido, pero las tarjetas usan otro cálculo. Faltan narrativa y "qué hacer" |
| Liquidez y caja | Flujo (Visión, Flujo libre, Dinámica diaria), Métricas #25–29 | 2 | 2 | Meses de respiro no aparece en Flujo. No hay proyección de caja. Las alertas no se ven. 3 fuentes de caja |
| Capital de trabajo | Cobranza, Métricas DSO/DPO/DIO/CCC, Flujo libre, Simulador | 2 | 3 | 3 DSO distintos. La antigüedad usa 2 criterios. No se ve el capital de trabajo en pesos |
| Solvencia y deuda | Métricas #34–41, Posición › Razones | 2 | 2 | Solo vive en el catálogo. Costo de deuda mensual vs anual. Sin vencimientos (no hay fuente de datos) |
| Concentración comercial | Top 5 (Resultados), Concentración (Cobranza) | 3 | 3 | 4 universos distintos de "cliente". Hay notas de método, pero no se concilian |
| Presupuesto y forecast | Resultados › Presupuesto, Simulador | 3 | 3 | Solo ingreso, costo y gasto. Ignora los drivers de intereses y depreciación. El presupuesto oficial queda en 0 con Compac |
| Auditoría y confianza | Clic a pólizas, Control de cargas, A = P + C | 3 | 3 | El sello del dato casi no se usa. La fila A = P + C desaparece sin aviso cuando no cuadra. No se ven las causas de filas rechazadas |
| Simulación | Simulador | 2 | 3 | La palanca de precio no mueve ingresos. Jerga ("What-If", "Drivers"). Meses de respiro distinto al catálogo |

---

## 3. Hallazgos por módulo
Severidad: **C** = crítico · **I** = importante · **M** = menor.

### Panel de Control (`/dashboard/control`)
- **I · Sin portada.** Un usuario nuevo ve solo el estado vacío con tres botones (`ControlPage.tsx:31-52`). El primer vistazo del dueño queda en blanco. → Portada por defecto (B05).
- **I · Favoritos guardados por navegador, no por empresa.** Se guardan en localStorage con una sola llave para todas las empresas (`favorites-storage.ts:1,55`). El socio CFO con varias empresas ve la misma selección en todas, y no se conservan entre dispositivos. → Guardarlos en servidor, por usuario y empresa (B17).
- **M · Fallas silenciosas.** Un widget que falla desaparece sin aviso (`favorite-widget-renderer.tsx:75-77`). Los favoritos viejos `metric:*` muestran "Meses de respiro" en días (`module-metric-favorites.tsx:46,91`).

### Resultados (`/dashboard/overview`)
- **C · Dos motores de PyG en la misma página.**
  - Las tarjetas `destacados:*`, `kpi-ingreso-*`, `kpi-costo-*`, `chart-ingresos-costos`, la serie y el PDF salen de `resultadosLedger.ts`. La tarjeta `destacados:utilidad` y el Estado de resultados salen de `computeErBuckets`.
  - El EBITDA está definido 4 veces: `estadoOperativo.ts:250`, `resultadosLedger.ts:58`, `forecast/series.ts:64`, `simulatorEngine.ts:210`.
  - → B01.
- **I · Hasta 4 "ingresos del mes" en el tab Ingreso.** La tarjeta (4xxx + 7xxx), Calidad (solo 4xxx), Top 5 clientes (cargos del auxiliar, probablemente con IVA) y Top 5 líneas. → Tras B01, una frase que concilie los universos.
- **I · Utilidad no sigue a la temporalidad.** Con Trimestre o Año, la tarjeta Utilidad sigue mostrando un solo mes (`utilidadRubro.ts`).
- **I · Lógica dependiente del idioma.** "vs mes anterior" está fijo en español y la lógica depende de ese texto (`financialDataTransformer.ts:489-514`). En inglés se rompe.
- **I · Sin narrativa.** `InsightText` solo muestra definiciones fijas. Los generadores `categoryInsight` y `costMixInsight` (es.json:213, 221) existen pero nadie los usa.
- **M · Etiquetas y textos incorrectos:**
  - "RAII" usado como utilidad antes de impuestos (es.json:457 y simulador :1117); RAII es EBIT;
  - Jaws formateado en "%" cuando son puntos;
  - "Acumulado de los últimos 12 meses" sobre series mensuales (es.json:290, 558);
  - el estado vacío de costos reutiliza el texto de ingresos (`CogsAnalisisCard.tsx:135`);
  - los filtros Divisa y Análisis no hacen nada (`resultados-filter-bar.tsx:136-162`);
  - el clic a pólizas solo funciona con cuentas fijas de un catálogo (`EstadoOperativoCard.tsx:82-92`).
- **M · Nombres confusos.** "Estado de resultados" y "Estado Operativo" se parecen demasiado. → Por ejemplo, "Estado de resultados" y "Operación mes a mes".
- **Fortalezas:**
  - clic hasta pólizas en tabla, treemap y Estado Operativo;
  - "N/A" en lugar de un 100% falso;
  - absorción explicada en "centavos por peso";
  - Jaws con ayuda en lenguaje claro;
  - presupuesto con rango y aviso de volatilidad.

### Posición Financiera
- **I · Razones siempre en verde.** Toda razón con valor se pinta en verde (`StatementTreeTable.tsx:384-390`): una razón circulante de 0.4 sale verde. Viola la regla de colores de señal de AGENTS.md.
- **I · Ceros que parecen datos.** El DSO del indicador vale 0 sin datos y sale "Zona verde" (`capitalTrabajoCalcs.ts:132`).
- **I · El cuadre falla en silencio.** Si A ≠ P + C, la fila de control desaparece sin aviso (`posicionFinanciera.ts:575`). El déficit patrimonial solo aparece en un tooltip.
- **M · Sin acción ni unidades.**
  - Los textos de los indicadores son fijos y no dicen qué hacer (`posicionFinanciera.gauges.insights.*`).
  - "Meses de respiro" aparece como "1.80" sin unidad.
  - "N/D" se promete y se pinta "—".
- **Fortalezas:**
  - árbol con signo económico y control A = P + C;
  - clic a pólizas;
  - explicaciones claras de cada indicador.

### Flujo
- **C · Alertas y proyección construidas pero no visibles.**
  - Las alertas de caja (`flujo.alertsMessages.*`) no se ven: `FlujoAlertas.tsx` no lo importa nadie.
  - Tampoco se ven la proyección 3/6/12 (`modules/flujoCaja.ts`, solo en la ruta legacy `/dashboard/cashflow`) ni los meses de respiro en la página.
  - → B02.
- **I · Dos saldos de caja sin explicación.** En Visión conviven el saldo de los auxiliares 06/07 y el del reporte de tesorería 03, sin decir de dónde sale cada uno.
- **M · Jerga y formato.**
  - "Origen y Aplicación de Fondos" y "dispersión de tesorería" sin traducir.
  - Las cifras de los KPIs no usan la tipografía mono (`FlujoOperativoView.tsx:76`).
  - El título del favorito ("Operativo") no coincide con el tab ("Dinámica Diaria").
- **Fortaleza modelo:** Flujo libre. Usa el sello `CifraMark` estimado, la frase "Cifra calculó este puente…" y un insight con monto y verbo ("Cobra esa cartera…").

### Cobranza
- **C · Dos criterios de antigüedad en el mismo tab.** La gráfica y "Saldos por cliente" cuentan días desde la emisión (`cobranzaTransformer.ts`). "Antigüedad de saldos" cuenta días desde el vencimiento (`antiguedad.ts`). El mismo cliente puede salir "90+" en una y "Corriente" en la otra. → B07.
- **I · DSO de Antigüedad mal calculado.** Mezcla cartera con IVA con ventas sin IVA, y muestra 0 en lugar de N/D (`cobranzaTransformer.ts:79`).
- **I · Dos fuentes que no se concilian.** "Total cartera" (tab Cartera, auxiliar CONTPAQi) y "Facturas pendientes" (tab Antigüedad, AuxiliarVentas) salen de fuentes distintas y la pantalla no lo explica.
- **I · No hay lista accionable.** Falta "clientes que no te pagan": la tabla ordena por saldo, sin siguiente paso ni monto en riesgo.
- **M · Léxico prohibido y jerga.** "Cartera > 60 días", "Antigüedad Prom.", "Bucket", "Top cliente", "HHI".
- **Fortalezas:**
  - estados vacíos que nombran el reporte CONTPAQi exacto;
  - tarjeta de brecha DSO − DPO;
  - monedas por separado, nunca sumadas.

### Métricas (catálogo de 50)
- **C · Ceros que no son datos.** Sin tesorería, OCF, FCF, CapEx, ROIC de caja y Eficiencia de caja muestran "0.0%". Sin cuenta de inventario, DIO muestra "0.0 días" (`financialEngine.ts`, `pctOf`). Es el riesgo de confianza más alto del producto. → B04.
- **I · Mensual contra anual.** Las rotaciones y el costo de deuda salen mensuales, pero la ayuda promete "veces al año". El WACC mezcla un costo de capital anual con un costo de deuda mensual (`metricsService.ts`, `financialSnapshot.ts`).
- **I · Variación mal expresada.** El cambio en métricas de porcentaje se muestra como variación relativa ("+20%") en vez de puntos ("+2 pts").
- **I · Parámetros fijos presentados como dato.** Ke, WACC y Spread se calculan con Rf=8%, ERP=6% y β=1 fijos (`financialSnapshot.ts:20-23`), sin decirlo en pantalla.
- **I · Demasiado denso para el dueño.** 50 tarjetas en 7 tabs. Destacados (`catalog-presenter.ts:35-44`) no incluye meses de respiro, DSO ni CCC. Falta "qué hacer" y semáforo por métrica.
- **M · Detalles.**
  - "Sin comparativo" se usa también cuando no hay dato.
  - Las fórmulas no se muestran en la tarjeta.
  - Liquidez repite los colores de Márgenes.
  - Sin balanza en el periodo aparece un error rojo en lugar del estado vacío (`metrics.emptyTitle` existe y no se usa).

### Simulador
- **I · Palanca de precio y caja.**
  - "Ajuste en precios de venta" no mueve Ingresos, solo baja el costo (`simulatorEngine.ts:205-206`).
  - "Impacto en caja" ignora intereses e impuestos, así que la palanca de tasa siempre da $0.
  - → B09.
- **I · Meses de respiro distinto al catálogo.** Usa la caja de balanza; el catálogo usa tesorería (`simulatorBaselineService.ts:114` vs `financialSnapshot.ts:192`). Aun así dice "(métrica #28)".
- **M · Colores y nombres.**
  - El CCC se pinta verde cuando sube, que es peor.
  - Hay colores fijos (emerald/red) y "N/D" fijo en el código.
  - Se llama "Simulador What-If" y "Drivers"; AGENTS.md lo nombra "Escenarios".
- **Fortalezas:**
  - la línea base sale de `computeErBuckets`;
  - con todas las palancas en cero reproduce la base;
  - gráfica tornado y exportación.

### Presupuesto
- **I · Drivers ignorados o duplicados.**
  - Los campos de intereses y depreciación no hacen nada (`BudgetDriversForm.tsx:23-24`; `applyBudgetDrivers` no los usa).
  - Plantilla × costo se suma encima del pronóstico de gasto, así que la nómina se cuenta doble.
  - La bandera `orientativa` del motor no se muestra.
- **Fortaleza:** el texto "La serie es volátil; toma el rango, no el punto".

### Ingesta y Control de cargas
- **C · Texto de desarrollador visible para clientes.**
  - `ingesta.sessionPeriod` (es.json:1499, en `ingesta/page.tsx:254`): "selecciona la empresa vacía… corte julio 2026"; `settings.compacHint` y `settings.companyCreated` dicen lo mismo.
  - La pantalla muestra códigos crudos: "master_workbook · master_template", "v1 · 87% · BUILTIN", "WARNING", "modo off" (`ingesta/page.tsx:347-485`).
  - → B03.
- **I · Checklist de datos incompleto.**
  - Solo aparece después de confirmar una carga y cuenta datos de toda la empresa, no del periodo (`dataCapabilities.ts:28-44`).
  - "Carga el auxiliar de clientes" pide un archivo que hoy no se puede guardar solo (`ingestionService.ts:129`).
- **I · Causas de rechazo ocultas.** Control de cargas no muestra por qué se rechazaron filas, aunque `IngestFileAudit` sí lo guarda (`ingestHistory.ts:42-55`).
- **Fortalezas:**
  - flujo detectar → confirmar;
  - periodo leído del archivo, con aviso si no coincide;
  - historial de cargas con autor y estado.

### Configuración
- **M · Jerga y rol.** "tenant", "aislamiento es por empresa" (`settings.intro`). "CFO Partner" en lugar de "Socio que opera la empresa".
- **Fortaleza:** los textos de Usuarios y su bitácora de cambios son el modelo a seguir.

### Transversal (E: deuda técnica visible)
- **Bug/copy:**
  - "Cuenta de mayor XXXX" en producción hasta correr `scripts/backfill-catalogo-mayor.ts` (pendiente tuyo);
  - N/D, s/d, N/A y "—" mezclados;
  - inglés residual (Run-Rate, Split, OPEX, COGS, YoY, MoM, P&L, ledger, Widgets);
  - código muerto (`components/dashboard/module-*.tsx`, `CustomizeViewMenu`);
  - `docs/estructura-actual-plataforma.md` desactualizado (habla de los tabs Destacados y Otras cuentas, la cascada con D&A y los tabs viejos de Flujo).
- **Hueco de producto:**
  - no hay notificaciones (ni correo ni resumen semanal);
  - `CifraMark` (punto sólido = confirmada, punto hueco = estimada, óvalo discontinuo = sin dato) solo se usa en Flujo libre;
  - "Te va a faltar" y "Esta cifra es estimada" no aparecen en ninguna pantalla.

---

## 4. Backlog priorizado
Tipos: **Bug** · **Copy** · **Exp** (exposición: ya existe, falta mostrarlo) · **Feat** (función nueva).
Datos: **B** = balanza · **T** = tesorería (reporte 03) · **A** = auxiliar de cuentas 06/07 · **V** = AuxiliarVentas/Egresos (plantilla máster).

| ID | Título | Tipo | Prio | Esf. | Datos | Módulo | Notas de implementación |
|---|---|---|---|---|---|---|---|
| B01 | Las tarjetas, la tendencia y el PDF de Resultados salen del PyG oficial | Bug | P0 | M | B | Resultados, Panel | Que `resultadosLedger` clasifique con `classifyErCuenta` o lea `computeErBuckets`. EBITDA = EBIT + D&A en todas partes |
| B02 | Mostrar alertas de caja y meses de respiro en Flujo › Visión | Exp | P0 | S | T/A | Flujo | Montar `FlujoAlertas` con monto en riesgo y verbo. Meses de respiro en meses, con su fuente |
| B03 | Quitar texto de desarrollador y códigos crudos | Copy | P0 | S | — | Ingesta, Configuración | `ingesta.sessionPeriod`, `settings.compacHint`/`companyCreated`, tipos y perfiles en lenguaje claro |
| B04 | "Sin dato" nunca se muestra como 0 | Bug | P0 | M | B/T | Métricas, Posición, PDF, Cobranza | null → N/D con razón y óvalo discontinuo. Razones con semáforo real, no verde fijo |
| B05 | Portada "Tu mes en 5 números" en el Panel de Control | Feat | P0 | M | B/T/A | Panel | Utilidad, tu caja, meses de respiro, clientes que no te pagan y 3 alertas, todos con widgets existentes |
| B06 | Una definición de DSO, caja y meses de respiro | Bug | P0 | M | B/T/A/V | Cobranza, Flujo, Métricas, Simulador | Un servicio por métrica. Cada pantalla dice de qué archivo sale |
| B07 | "Clientes que no te pagan": lista accionable con un solo criterio de antigüedad | Feat | P0 | M | V (o A) | Cobranza | Días desde vencimiento. Monto vencido, días y acción sugerida ("llama", "suspende crédito") |
| B08 | Mostrar alerta de desviaciones de gasto | Exp | P1 | S | B | Resultados › Gasto | `gastoOpexService.ts:117-131` ya la calcula; textos en es.json:330-341 |
| B09 | Simulador → "Escenarios": precio mueve ingresos, caja incluye intereses e ISR | Bug | P1 | S | B | Simulador | Corregir colores del CCC. Quitar What-If, Drivers y tornado del texto |
| B10 | Métricas como capa avanzada; Destacados para el dueño | Feat | P1 | M | B | Métricas | Agregar meses de respiro, DSO, CCC y cobertura de intereses. "Qué hacer" por métrica. Anualizar rotaciones y costo de deuda. Deltas en puntos |
| B11 | Paquete del mes útil | Feat | P1 | M | B/T/A | Resultados (PDF) | Utilidad neta, caja, meses de respiro, cartera vencida y 3 acciones. Sin $0 inventados |
| B12 | Sello de calidad del dato en cada KPI | Exp | P1 | M | — | Todos | Conectar `periodOrigins` y `CifraMark`. Corregir `dataOrigin` para que no diga "seed" a clientes |
| B13 | Ingesta: "qué archivo desbloquea qué", por periodo y antes de subir | Feat | P1 | S | — | Ingesta | Reusar `dataCapabilities`. Mostrar causas de filas rechazadas en Control de cargas |
| B14 | Favoritos por usuario y empresa, guardados en servidor | Feat | P1 | M | — | Panel | Hoy van en localStorage con una llave global |
| B15 | Presupuesto: drivers que sí funcionan | Bug | P1 | S | B | Resultados › Presupuesto | Usar o quitar intereses y depreciación. Evitar nómina doble. Mostrar "orientativa" |
| B16 | Barrido de léxico y jerga | Copy | P1 | S | — | Todos | "Cliente que no te paga", RAII → EBIT, unificar N/D, quitar anglicismos |
| B17 | Capital de trabajo en pesos y alerta de déficit patrimonial | Feat | P1 | S | B | Posición | Aviso visible cuando A ≠ P + C o el capital es negativo, con acción |
| B18 | Proyección de caja a 13 semanas ("te va a faltar") | Feat | P2 | L | T + V | Flujo | Requiere vencimientos de CxC y CxP. Solo con balanza sería engañosa |
| B19 | Monitor de impuestos y cuentas puente | Exp | P2 | M | B | Resultados | `rifAuditoria.ts` existe sin ruta. Validarlo con un contador antes de mostrarlo |
| B20 | Limpieza de código muerto y actualizar `estructura-actual-plataforma.md` | Copy | P2 | S | — | — | `module-*.tsx`, `CustomizeViewMenu`, favoritos `metric:*` legacy |

**Con contador externo vs sin contador interno:** B04, B07 y B13 pesan más **sin contador interno**, porque nadie filtra un 0 falso ni sabe qué archivo falta. B10 (Métricas avanzadas) y B19 sirven sobre todo **al contador o socio CFO**.

### No hacer aún
- **Destacar WACC, Ke y Spread económico.** Hoy salen de parámetros fijos; mostrarlos al dueño parecería un dato real.
- **Vencimientos de deuda y calendario de amortización.** No hay fuente de datos en la ingesta.
- **Comparativos sectoriales.** Falta definir el giro y una fuente confiable.
- **Notificaciones por correo o WhatsApp.** Primero B01, B04 y B06: una alerta con cifra equivocada daña la confianza más que no tener alerta.
- **Chat con IA, consolidación multimoneda o balance proyectado.** Seductores, pero el problema hoy es la coherencia, no la cantidad de funciones.

---

## 5. Bocetos en texto (P0)
**Panel de Control › Tu mes en 5 números (B05)**
- Título: "Julio: así cerró tu mes".
- Frase: "Vendiste $X, te quedaron $Y de utilidad y tu caja alcanza para N meses de respiro."
- Tabla: Utilidad neta · Tu caja · Meses de respiro · Clientes que no te pagan · Gasto vs mes anterior. Cada cifra con su sello (confirmada o estimada) y el clic a su módulo.
- Alerta: "Tres clientes te deben $Z con más de 60 días vencidos. Llámalos esta semana."

**Flujo › Tu caja (B02 + B06)**
- Título: "Tu caja".
- Frase: "Tienes $X en bancos; al ritmo de los últimos 3 meses te alcanza para N meses."
- Gráfica: saldo de caja de 12 meses con la línea de mínimo sano.
- Alerta: "Llevas 2 meses sacando más de lo que entra. Revisa pagos a proveedores antes del día 15."

**Cobranza › Clientes que no te pagan (B07)**
- Título: "Clientes que no te pagan".
- Frase: "Te deben $X vencidos; el 70% está en 3 clientes."
- Tabla: cliente · vencido · días · última cobranza · acción sugerida.
- Alerta: "[Cliente] acumula $Z con 90 días. Suspende su crédito hasta que pague."

($X, $Y, $Z y N son marcadores, no cifras de ejemplo.)

---

## 6. Preguntas abiertas al negocio
1. ¿Quién mira el tablero primero: el dueño (rol CLIENT_VIEWER) o el socio CFO? Define la portada y qué tan visible queda Métricas.
2. ¿Los clientes cargarán la plantilla máster con ventas y egresos, o solo reportes CONTPAQi? Define la fuente de antigüedad y de días de cobro (B06, B07).
3. ¿Giro objetivo: comercio, manufactura o servicios? Cambia el peso de inventario (DIO) y el desglose de costo.
4. ¿El presupuesto oficial lo captura el contador en Cifra o se importa? Con Compac hoy queda en 0.
5. ¿Quieren un resumen semanal por correo cuando B01, B04 y B06 estén listos?

---

## Cómo se verificó este informe
- Las rutas y líneas citadas salen de la revisión de tres agentes de exploración. Confirmé a mano las más críticas:
  - `resultadosLedger.ts:52-63` y `accountClassify.ts` (7xxx → Ingreso, 8xxx → OpEx);
  - `FlujoAlertas`, `FlujoActividadesView` y `FlujoTendenciaChart` sin importadores;
  - `ingesta.sessionPeriod` visible (es.json:1499, `ingesta/page.tsx:254`);
  - `simulatorEngine.ts:205-206` (precio no mueve ingresos);
  - `StatementTreeTable.tsx:384-390` (razones en verde);
  - `rifAuditoria.ts` solo usado por su test.
- Los ítems B01–B20 se implementan por separado, cada uno en la rama `dev` con su prueba, antes de pasar a producción.
