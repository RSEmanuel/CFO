# Inventario Data_ejemplo

Fuente: `Data_ejemplo/` (8 × `.xlsx`). Sistema de origen por huella: **Compac** (hoja `Reporte de Compac` / títulos “Balanza de comprobación”, no por el nombre del archivo). Periodo inferido del título: **julio 2026** (`01/Jul/2026`–`31/Jul/2026`). RFC en diarios enmascarado en muestras.

Muestras sin nombres reales de terceros: se sustituyen por `[ENTIDAD]`.

## Resumen

| Archivo | Ext | Tamaño | Tipo | Hojas | headerRow | Confianza | ¿Persiste v1? |
|---|---|---|---|---|---|---|---|
| 01. Posicion financiera… | xlsx | ~11 KB | `posicion_financiera` | Reporte de Compac (1) | 4 (secciones, no tabla) | media | No |
| 02. Estado de Resultados… | xlsx | ~10 KB | `estado_resultados` | Estado de Resultados (1) | 4 | media | No |
| 03. Flujo de Efectivo… | xlsx | ~10 KB | `flujo_efectivo` | Flujo de Efectivo (1) | 4 | media | No (tesorería N/D) |
| 04. Origen y Aplicacion… | xlsx | ~10 KB | `origen_recursos` | Reporte de Compac (1) | 2 | media | No |
| 05. Balanza de Comprobacion… | xlsx | ~48 KB | `balanza` | Balanza de Comprobación (1) | 4–5 | alta | Sí → BalanzaPnL |
| 06. Movimientos auxiliares… (MXN) | xlsx | ~154 KB | `auxiliar_cuentas` | Reporte de Compac (1) | 6–7 | alta | No (no es auxiliar de clientes) |
| 07. Movimientos auxiliares… (USD) | xlsx | ~107 KB | `auxiliar_cuentas` | Reporte de Compac (1) | 6–7 | alta | No (USD + mismo tipo) |
| 08. Diarios y Polizas… | xlsx | ~155 KB | `diarios_polizas` | Diarios y Pólizas (1) | 7–8 | alta | No |

No hay PDF/CSV/ZIP. No hay auxiliar de clientes/proveedores con folio+IVA+estatus. No hay tesorería canónica (`id_banco_caja` + entradas/salidas OpEx/CapEx/deuda).

## 05 — Balanza (contrato canónico)

- Encabezados crudos fila 4: `C u e n t a`, `N o m b r e`, `Saldos Iniciales`, `Saldos Iniciales`, `Saldos Actuales`, `Saldos Actuales`
- Fila 5: `Deudor`, `Acreedor`, `Cargos`, `Abonos`, `Deudor`, `Acreedor`
- Datos desde fila 7. ~670 renglones jerárquicos; **606 hojas**. Σ cargos hojas = Σ abonos hojas (partida doble OK **solo en hojas**; el total con padres duplica).
- Muestra (enmascarada): `1101-0001-0000-0000 | CAJA CHICA | 17999.69 | | 0 | 0 | 17999.69 |`
- Dinero: C–H. Cuenta: A (`####-####-####-####`). Fechas: solo en título.
- Huecos vs `BalanzaPnL`: no `categoria_maestra`, no `monto_presupuestado`, no `periodo`/`anio` por fila, `debe`/`haber` se llaman Cargos/Abonos. Saldos en par deudor/acreedor.
- **Regla partida doble:** `full` sobre **cuentas hoja** (`leafOnly`). No copiar `assertPartidaDoble` sobre el archivo completo.
- Prefijos SAT-like observados: 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingreso, 5 COGS, 6 OpEx, 7 Ingreso (productos financieros), 8 OpEx (gastos financieros).

## 06 / 07 — Auxiliar de cuentas

- Huella: `Fecha, Tipo, Número, Concepto, Referencia, Cargos, Abonos, Saldo` + bloques por cuenta.
- No hay cliente, folio fiscal, IVA, cobrado, estatus. **No mapear a AuxiliarVentas.**

## 01 / 02 / 03 / 04 / 08

Informes presentados (dos columnas, renglones agrupados) o pólizas. Sin columnas 1:1 al máster. Flujo de efectivo 03 tiene ingresos/egresos de bancos pero no el desglose CapEx/servicio de deuda del contrato; **no se fabrica TesoreriaFlujo**.

## Qué queda N/D en el dashboard (paquete cliente)

| Dataset | Tras ingesta de 05 |
|---|---|
| PyG / Posición / Balanza / 50 métricas de ledger | Disponible (desde BalanzaPnL hojas) |
| Presupuesto oficial | N/D (`montoPresupuestado=0`) |
| Cobranza / DSO (AuxiliarVentas) | N/D |
| CxP / egresos | N/D |
| Flujo de caja tesorería | N/D (salvo puente opt-in, apagado) |
