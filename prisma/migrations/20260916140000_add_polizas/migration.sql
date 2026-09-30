-- CreateTable
CREATE TABLE "polizas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "concepto" TEXT NOT NULL,
    "totalCargos" DECIMAL(18,2) NOT NULL,
    "totalAbonos" DECIMAL(18,2) NOT NULL,
    "cuadrada" BOOLEAN NOT NULL DEFAULT true,
    "movimientosCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polizas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poliza_movimientos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "tipoPoliza" TEXT NOT NULL,
    "numeroPoliza" INTEGER NOT NULL,
    "numeroMovimiento" INTEGER NOT NULL,
    "codigoCuenta" TEXT NOT NULL,
    "nombreCuenta" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "cargo" DECIMAL(18,2) NOT NULL,
    "abono" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poliza_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "polizas_tenantId_idx" ON "polizas"("tenantId");

-- CreateIndex
CREATE INDEX "polizas_tenantId_anio_periodo_idx" ON "polizas"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "polizas_tenantId_anio_periodo_tipo_numero_key" ON "polizas"("tenantId", "anio", "periodo", "tipo", "numero");

-- CreateIndex
CREATE INDEX "poliza_movimientos_tenantId_idx" ON "poliza_movimientos"("tenantId");

-- CreateIndex
CREATE INDEX "poliza_movimientos_tenantId_anio_periodo_idx" ON "poliza_movimientos"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE INDEX "poliza_movimientos_tenantId_anio_periodo_tipoPoliza_numeroPoliza_idx" ON "poliza_movimientos"("tenantId", "anio", "periodo", "tipoPoliza", "numeroPoliza");

-- CreateIndex
CREATE INDEX "poliza_movimientos_tenantId_codigoCuenta_idx" ON "poliza_movimientos"("tenantId", "codigoCuenta");

-- AddForeignKey
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poliza_movimientos" ADD CONSTRAINT "poliza_movimientos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
