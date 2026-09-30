-- CreateEnum
CREATE TYPE "FlujoDireccion" AS ENUM ('ingreso', 'egreso');

-- AlterTable
ALTER TABLE "ingest_mapping_profiles" ADD COLUMN     "flujoConfig" JSONB;

-- CreateTable
CREATE TABLE "tesoreria_flujo_detalle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "idBancoCaja" TEXT NOT NULL,
    "direccion" "FlujoDireccion" NOT NULL,
    "categoriaKey" TEXT NOT NULL,
    "labelOrigen" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "esTraspaso" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_flujo_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tesoreria_flujo_detalle_tenantId_idx" ON "tesoreria_flujo_detalle"("tenantId");

-- CreateIndex
CREATE INDEX "tesoreria_flujo_detalle_tenantId_anio_periodo_idx" ON "tesoreria_flujo_detalle"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_flujo_detalle_tenantId_anio_periodo_idBancoCaja_d_key" ON "tesoreria_flujo_detalle"("tenantId", "anio", "periodo", "idBancoCaja", "direccion", "categoriaKey");

-- AddForeignKey
ALTER TABLE "tesoreria_flujo_detalle" ADD CONSTRAINT "tesoreria_flujo_detalle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
