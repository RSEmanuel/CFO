-- CreateTable
CREATE TABLE "cuentas_catalogo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idCuenta" TEXT NOT NULL,
    "nombreCuenta" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_catalogo_tenantId_idCuenta_key" ON "cuentas_catalogo"("tenantId", "idCuenta");

-- AddForeignKey
ALTER TABLE "cuentas_catalogo" ADD CONSTRAINT "cuentas_catalogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
