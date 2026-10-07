# Cifra · CFO virtual

Plataforma de CFO virtual para PyMEs mexicanas. Next.js 14 + Prisma 7 + PostgreSQL, multi-tenant, i18n es/en.

## Reglas del proyecto

Las reglas completas viven en dos archivos que debes seguir en todo lo que generes:

@AGENTS.md
@.cursorrules

En resumen:

- **Marca**: el producto se llama Cifra. Importa los SVG de `assets/`; nunca redibujes el logo. Usa siempre las variables de `tokens/cifra.tokens.css`, nunca hexadecimales.
- **Tipografía**: Manrope para UI, Azeret Mono con `tabular-nums` para toda cifra (clase `.cifra-num`).
- **Copy**: español de México, para dueños de PyME que no son contadores. Di el número, qué significa y qué hacer. Toda alerta termina en verbo. Nunca inventes cifras de ejemplo que parezcan reales.
- **Datos**: `df_balanza` y `df_ventas` siguen el contrato definido en `.cursorrules`. Las cifras canónicas del PyG salen de `computeErBuckets` (`src/services/estadoOperativo.ts`); no recomputes con clasificaciones propias.

## Comandos

```bash
npm run dev          # arranca la app (levanta la base local vía predev)
npm run db:start     # Postgres local de prisma dev
npm run db:export    # respaldo completo a backup-cfo.sql
npm run db:import    # restaura backup-cfo.sql
npx prisma migrate deploy
```

## Migración entre máquinas

Sigue `LEEME-MIGRACION.md`: el código viaja por GitHub; `backup-cfo.sql` y `.env` viajan aparte (Drive privado), nunca en git.
