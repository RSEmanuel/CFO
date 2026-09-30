-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CFO_PARTNER', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "CategoriaMaestra" AS ENUM ('Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'COGS', 'OpEx');

-- CreateEnum
CREATE TYPE "EstatusPago" AS ENUM ('Pagado', 'Pendiente', 'Cancelado');

-- CreateEnum
CREATE TYPE "ClasificacionGasto" AS ENUM ('Fijo', 'Variable');

-- CreateEnum
CREATE TYPE "TipoInversion" AS ENUM ('OpEx', 'CapEx');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balanzas_pnl" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idCuenta" TEXT NOT NULL,
    "nombreCuenta" TEXT NOT NULL,
    "categoriaMaestra" "CategoriaMaestra" NOT NULL,
    "saldoInicial" DECIMAL(18,2) NOT NULL,
    "debe" DECIMAL(18,2) NOT NULL,
    "haber" DECIMAL(18,2) NOT NULL,
    "saldoFinal" DECIMAL(18,2) NOT NULL,
    "montoPresupuestado" DECIMAL(18,2) NOT NULL,
    "depreciacionAmortizacion" BOOLEAN NOT NULL DEFAULT false,
    "periodo" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanzas_pnl_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "balanzas_pnl_periodo_check" CHECK ("periodo" >= 1 AND "periodo" <= 12)
);

-- CreateTable
CREATE TABLE "auxiliares_ventas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idCliente" TEXT NOT NULL,
    "nombreCliente" TEXT NOT NULL,
    "folioFactura" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "montoSubtotal" DECIMAL(18,2) NOT NULL,
    "iva" DECIMAL(18,2) NOT NULL,
    "montoCobrado" DECIMAL(18,2) NOT NULL,
    "estatusPago" "EstatusPago" NOT NULL,
    "lineaNegocio" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auxiliares_ventas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auxiliares_ventas_fecha_emision_check" CHECK ("fechaEmision" <= CURRENT_DATE)
);

-- CreateTable
CREATE TABLE "auxiliares_egresos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idProveedor" TEXT NOT NULL,
    "nombreProveedor" TEXT NOT NULL,
    "folioDocumento" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "montoSubtotal" DECIMAL(18,2) NOT NULL,
    "centroDeCostos" TEXT NOT NULL,
    "clasificacionGasto" "ClasificacionGasto" NOT NULL,
    "tipoInversion" "TipoInversion" NOT NULL,
    "estatusPago" "EstatusPago" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auxiliares_egresos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auxiliares_egresos_fecha_emision_check" CHECK ("fechaEmision" <= CURRENT_DATE)
);

-- CreateTable
CREATE TABLE "tesoreria_flujos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idBancoCaja" TEXT NOT NULL,
    "saldoInicialPeriodo" DECIMAL(18,2) NOT NULL,
    "entradasOperativas" DECIMAL(18,2) NOT NULL,
    "salidasOperativas" DECIMAL(18,2) NOT NULL,
    "salidasCapex" DECIMAL(18,2) NOT NULL,
    "servicioDeuda" DECIMAL(18,2) NOT NULL,
    "saldoFinalPeriodo" DECIMAL(18,2) NOT NULL,
    "periodo" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_flujos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tesoreria_flujos_periodo_check" CHECK ("periodo" >= 1 AND "periodo" <= 12),
    CONSTRAINT "tesoreria_flujos_identidad_check" CHECK (
      "saldoFinalPeriodo" = "saldoInicialPeriodo" + "entradasOperativas" - "salidasOperativas" - "salidasCapex" - "servicioDeuda"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_rfc_key" ON "tenants"("rfc");

-- CreateIndex
CREATE INDEX "tenants_rfc_idx" ON "tenants"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "balanzas_pnl_tenantId_idx" ON "balanzas_pnl"("tenantId");

-- CreateIndex
CREATE INDEX "balanzas_pnl_tenantId_anio_periodo_idx" ON "balanzas_pnl"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE INDEX "balanzas_pnl_tenantId_categoriaMaestra_idx" ON "balanzas_pnl"("tenantId", "categoriaMaestra");

-- CreateIndex
CREATE UNIQUE INDEX "balanzas_pnl_tenantId_anio_periodo_idCuenta_key" ON "balanzas_pnl"("tenantId", "anio", "periodo", "idCuenta");

-- CreateIndex
CREATE INDEX "auxiliares_ventas_tenantId_idx" ON "auxiliares_ventas"("tenantId");

-- CreateIndex
CREATE INDEX "auxiliares_ventas_tenantId_idCliente_idx" ON "auxiliares_ventas"("tenantId", "idCliente");

-- CreateIndex
CREATE INDEX "auxiliares_ventas_tenantId_fechaEmision_idx" ON "auxiliares_ventas"("tenantId", "fechaEmision");

-- CreateIndex
CREATE INDEX "auxiliares_ventas_tenantId_estatusPago_idx" ON "auxiliares_ventas"("tenantId", "estatusPago");

-- CreateIndex
CREATE UNIQUE INDEX "auxiliares_ventas_tenantId_folioFactura_key" ON "auxiliares_ventas"("tenantId", "folioFactura");

-- CreateIndex
CREATE INDEX "auxiliares_egresos_tenantId_idx" ON "auxiliares_egresos"("tenantId");

-- CreateIndex
CREATE INDEX "auxiliares_egresos_tenantId_idProveedor_idx" ON "auxiliares_egresos"("tenantId", "idProveedor");

-- CreateIndex
CREATE INDEX "auxiliares_egresos_tenantId_fechaEmision_idx" ON "auxiliares_egresos"("tenantId", "fechaEmision");

-- CreateIndex
CREATE INDEX "auxiliares_egresos_tenantId_clasificacionGasto_tipoInversio_idx" ON "auxiliares_egresos"("tenantId", "clasificacionGasto", "tipoInversion");

-- CreateIndex
CREATE UNIQUE INDEX "auxiliares_egresos_tenantId_folioDocumento_key" ON "auxiliares_egresos"("tenantId", "folioDocumento");

-- CreateIndex
CREATE INDEX "tesoreria_flujos_tenantId_idx" ON "tesoreria_flujos"("tenantId");

-- CreateIndex
CREATE INDEX "tesoreria_flujos_tenantId_anio_periodo_idx" ON "tesoreria_flujos"("tenantId", "anio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_flujos_tenantId_anio_periodo_idBancoCaja_key" ON "tesoreria_flujos"("tenantId", "anio", "periodo", "idBancoCaja");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balanzas_pnl" ADD CONSTRAINT "balanzas_pnl_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auxiliares_ventas" ADD CONSTRAINT "auxiliares_ventas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auxiliares_egresos" ADD CONSTRAINT "auxiliares_egresos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_flujos" ADD CONSTRAINT "tesoreria_flujos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
