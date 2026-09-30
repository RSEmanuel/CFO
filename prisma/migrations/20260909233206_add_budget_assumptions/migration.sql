-- DropIndex
DROP INDEX "ingest_mapping_profiles_documentType_idx";

-- CreateTable
CREATE TABLE "budget_assumptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "salesGrowthPct" DECIMAL(6,3) NOT NULL,
    "inflationPct" DECIMAL(6,3) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "headcountCostMonthly" DECIMAL(14,2) NOT NULL,
    "debtInterestMonthly" DECIMAL(14,2) NOT NULL,
    "depreciationMonthly" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_assumptions_tenantId_idx" ON "budget_assumptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_assumptions_tenantId_anio_key" ON "budget_assumptions"("tenantId", "anio");

-- AddForeignKey
ALTER TABLE "budget_assumptions" ADD CONSTRAINT "budget_assumptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ingest_mapping_profiles_origin_source_document_active_idx" RENAME TO "ingest_mapping_profiles_origin_sourceSystem_documentType_is_idx";
