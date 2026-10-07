# Cifra

**Cifra · CFO virtual** — Tus cifras, en claro.

Plataforma web de inteligencia financiera para PyMEs mexicanas. Ingiere archivos contables de CONTPAQi (Balanza de Comprobación, Auxiliares, Pólizas y Flujo de Efectivo) o una Plantilla Máster propia, y genera dashboards ejecutivos, un catálogo de 50 métricas financieras, proyecciones de presupuesto y herramientas de auditoría.

## Stack

- **Frontend:** Next.js 14 (App Router) · React 18 · TailwindCSS · Radix UI · next-intl (ES/EN)
- **Gráficos:** Recharts · Apache ECharts
- **Backend:** API Routes de Next.js · Prisma sobre PostgreSQL (multi-tenant)
- **Auth:** AWS Cognito (JWT) con roles `ADMIN`, `CFO_PARTNER`, `CLIENT_VIEWER`
- **Exportación:** jsPDF · html-to-image · ExcelJS

## Desarrollo

```bash
npm install
npm run dev
```

La app corre en `http://localhost:3000`. Para migrar la base de datos con datos reales, consulta `LEEME-MIGRACION.md`.

## Marca

La identidad de marca (nombre, logo, color, tipografía y copy) está definida en `.cursor/rules/cifra-brand.mdc` y `AGENTS.md`. Los tokens viven en `tokens/cifra.tokens.css` y los assets del logo en `assets/` (servidos desde `public/assets/`).

- Tipografía base: **Manrope**. Cifras: **Azeret Mono** con `tabular-nums`.
- Color de marca: cobalto `--cifra-brand`. Fondo: papel `--cifra-paper`.
- Usa siempre las variables `--cifra-*`, nunca hexadecimales en el código.
