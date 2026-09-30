-- CreateTable
CREATE TABLE "auxiliar_movimientos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL,
    "idCuenta" TEXT NOT NULL,
    "nombreCuenta" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipoPoliza" TEXT NOT NULL,
    "numeroPoliza" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "cargos" DECIMAL(18,2) NOT NULL,
    "abonos" DECIMAL(18,2) NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auxiliar_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auxiliar_cuenta_resumen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL,
    "idCuenta" TEXT NOT NULL,
    "nombreCuenta" TEXT NOT NULL,
    "saldoInicial" DECIMAL(18,2) NOT NULL,
    "cargos" DECIMAL(18,2) NOT NULL,
    "abonos" DECIMAL(18,2) NOT NULL,
    "saldoFinal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auxiliar_cuenta_resumen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auxiliar_movimientos_tenantId_idx" ON "auxiliar_movimientos"("tenantId");

-- CreateIndex
CREATE INDEX "auxiliar_movimientos_tenantId_anio_periodo_idx" ON "auxiliar_movimientos"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE INDEX "auxiliar_movimientos_tenantId_idCuenta_fecha_idx" ON "auxiliar_movimientos"("tenantId", "idCuenta", "fecha");

-- CreateIndex
CREATE INDEX "auxiliar_cuenta_resumen_tenantId_anio_periodo_idx" ON "auxiliar_cuenta_resumen"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "auxiliar_cuenta_resumen_tenantId_anio_periodo_moneda_idCuen_key" ON "auxiliar_cuenta_resumen"("tenantId", "anio", "periodo", "moneda", "idCuenta");

-- AddForeignKey
ALTER TABLE "auxiliar_movimientos" ADD CONSTRAINT "auxiliar_movimientos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auxiliar_cuenta_resumen" ADD CONSTRAINT "auxiliar_cuenta_resumen_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "poliza_movimientos_tenantId_anio_periodo_tipoPoliza_numeroPoliz" RENAME TO "poliza_movimientos_tenantId_anio_periodo_tipoPoliza_numeroP_idx";
