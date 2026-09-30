-- CreateTable
CREATE TABLE "ingest_mapping_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "sheetMatch" TEXT,
    "columnMap" JSONB NOT NULL,
    "enumMap" JSONB NOT NULL,
    "accountPrefixRules" JSONB,
    "partidaDobleMode" TEXT NOT NULL DEFAULT 'full',
    "bridgeTesoreriaFromBalanza" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_mapping_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingest_mapping_profiles_tenantId_idx" ON "ingest_mapping_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "ingest_mapping_profiles_documentType_idx" ON "ingest_mapping_profiles"("documentType");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_mapping_profiles_tenantId_sourceSystem_documentType_key" ON "ingest_mapping_profiles"("tenantId", "sourceSystem", "documentType");

-- AddForeignKey
ALTER TABLE "ingest_mapping_profiles" ADD CONSTRAINT "ingest_mapping_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
