import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Solo `prisma migrate dev` usa la base sombra; el build y los despliegues no la necesitan.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
