# Migración a Mac (u otra máquina)

Guía para mover este proyecto conservando **toda la data** cargada (tenants, balanzas, auxiliares, pólizas, perfiles de ingesta).

## Qué va dónde

| Qué | Dónde | Por qué |
|---|---|---|
| Código fuente | GitHub (`RSEmanuel/CFO`) | Es el repo del proyecto |
| `backup-cfo.sql` | Google Drive (carpeta privada) | Son los datos del negocio; no van en git |
| `.env` | Google Drive (carpeta privada) | Config local; está en `.gitignore` |

## Archivos que debes subir a Drive

Desde la raíz del proyecto en la laptop vieja:

1. **`backup-cfo.sql`** (~21 MB) — respaldo completo generado con `npm run db:export`.
2. **`.env`** (~2 KB) — tu configuración local.

> Verifica que `backup-cfo.sql` termine con la línea `COMMIT;` antes de subirlo.

## Setup en la Mac

### 1. Instalar herramientas

```bash
# Homebrew (brew.sh), luego:
brew install node git
```

### 2. Clonar e instalar

```bash
git clone https://github.com/RSEmanuel/CFO.git
cd CFO
npm install
```

### 3. Configurar entorno

Copia el `.env` que guardaste en Drive a la raíz del proyecto (o `cp .env.example .env`; los valores locales son los mismos).

### 4. Levantar la base local y crear el esquema

```bash
npm run db:start              # levanta el Postgres local de prisma dev
npx prisma migrate deploy     # crea todas las tablas
```

En Mac, `prisma dev` guarda sus datos en `~/Library/Application Support/prisma-dev-nodejs/Data` (el script `scripts/ensure-dev-db.ts` ya maneja esa ruta).

### 5. Restaurar la data

Descarga `backup-cfo.sql` de Drive a la raíz del proyecto y:

```bash
npm run db:import
```

No necesitas `psql` ni `pg_dump`: el import usa el driver `pg` que ya es dependencia del proyecto.

### 6. Arrancar la app

```bash
npm run dev
```

Abre http://localhost:3000 y verifica que aparezcan tus tenants, balanzas y auxiliares.

## Solución de problemas

- **Puerto 51214 ocupado en la Mac**: cambia `DATABASE_URL`/`SHADOW_DATABASE_URL` en `.env` y recrea la base con
  `npx prisma dev --name cfo --detach --db-port <puerto> --shadow-db-port <puerto+1>`.
- **"Lock file is already being held"**: borra `~/Library/Application Support/prisma-dev-nodejs/Data/durable-streams/cfo/server.lock.lock` y vuelve a `npm run db:start` (el `predev` ya lo intenta solo).
- **Base vacía tras el import**: asegúrate de haber corrido `npx prisma migrate deploy` ANTES de `npm run db:import`.

## Re-exportar en el futuro

Para generar un respaldo nuevo en cualquier máquina:

```bash
npm run db:export   # escribe backup-cfo.sql (o BACKUP_FILE=otro.sql)
```
