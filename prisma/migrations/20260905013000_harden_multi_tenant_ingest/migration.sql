-- Profile origin/versioning. Existing rows remain tenant-owned and immutable.
CREATE TYPE "IngestProfileOrigin" AS ENUM ('BUILTIN', 'TENANT');
CREATE TYPE "IngestAuditStatus" AS ENUM ('DETECTED', 'VALIDATED', 'COMMITTED', 'REJECTED');

DROP INDEX IF EXISTS "ingest_mapping_profiles_tenantId_sourceSystem_documentType_key";

ALTER TABLE "ingest_mapping_profiles"
  ADD COLUMN "origin" "IngestProfileOrigin",
  ADD COLUMN "profileKey" TEXT,
  ADD COLUMN "version" INTEGER,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "matcherConfig" JSONB,
  ADD COLUMN "fingerprintHash" TEXT;

UPDATE "ingest_mapping_profiles"
SET
  "origin" = 'TENANT',
  "profileKey" = "sourceSystem" || '/' || "documentType",
  "version" = 1,
  "matcherConfig" = '{}'::jsonb,
  "fingerprintHash" = md5("id" || ':' || "updatedAt"::text);

ALTER TABLE "ingest_mapping_profiles"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ALTER COLUMN "origin" SET NOT NULL,
  ALTER COLUMN "profileKey" SET NOT NULL,
  ALTER COLUMN "version" SET NOT NULL,
  ALTER COLUMN "matcherConfig" SET NOT NULL,
  ALTER COLUMN "fingerprintHash" SET NOT NULL;

ALTER TABLE "ingest_mapping_profiles"
  ADD CONSTRAINT "ingest_profile_origin_tenant_check"
  CHECK (
    ("origin" = 'BUILTIN' AND "tenantId" IS NULL) OR
    ("origin" = 'TENANT' AND "tenantId" IS NOT NULL)
  ),
  ADD CONSTRAINT "ingest_profile_version_positive_check" CHECK ("version" > 0);

CREATE UNIQUE INDEX "ingest_profiles_builtin_key_version_key"
  ON "ingest_mapping_profiles"("profileKey", "version")
  WHERE "origin" = 'BUILTIN';
CREATE UNIQUE INDEX "ingest_profiles_tenant_key_version_key"
  ON "ingest_mapping_profiles"("tenantId", "profileKey", "version")
  WHERE "origin" = 'TENANT';
CREATE INDEX "ingest_mapping_profiles_origin_source_document_active_idx"
  ON "ingest_mapping_profiles"("origin", "sourceSystem", "documentType", "isActive");
CREATE INDEX "ingest_mapping_profiles_profileKey_version_idx"
  ON "ingest_mapping_profiles"("profileKey", "version");

CREATE TABLE "ingest_batches" (
  "id" TEXT NOT NULL,
  "detectionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "IngestAuditStatus" NOT NULL,
  "periodo" INTEGER,
  "anio" INTEGER,
  "fileCount" INTEGER NOT NULL,
  "counts" JSONB,
  "issues" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingest_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingest_file_audits" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "profileId" TEXT,
  "profileKey" TEXT,
  "profileVersion" INTEGER,
  "periodo" INTEGER,
  "anio" INTEGER,
  "rowsRead" INTEGER NOT NULL DEFAULT 0,
  "rowsAccepted" INTEGER NOT NULL DEFAULT 0,
  "rowsRejected" INTEGER NOT NULL DEFAULT 0,
  "warnings" JSONB,
  "errors" JSONB,
  "status" "IngestAuditStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingest_file_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingest_batches_detectionId_key" ON "ingest_batches"("detectionId");
CREATE INDEX "ingest_batches_tenantId_createdAt_idx" ON "ingest_batches"("tenantId", "createdAt");
CREATE INDEX "ingest_batches_tenantId_status_idx" ON "ingest_batches"("tenantId", "status");
CREATE UNIQUE INDEX "ingest_file_audits_batchId_sha256_key" ON "ingest_file_audits"("batchId", "sha256");
CREATE INDEX "ingest_file_audits_tenantId_createdAt_idx" ON "ingest_file_audits"("tenantId", "createdAt");
CREATE INDEX "ingest_file_audits_tenantId_sha256_idx" ON "ingest_file_audits"("tenantId", "sha256");
CREATE INDEX "ingest_file_audits_tenantId_status_idx" ON "ingest_file_audits"("tenantId", "status");

ALTER TABLE "ingest_batches"
  ADD CONSTRAINT "ingest_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ingest_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingest_file_audits"
  ADD CONSTRAINT "ingest_file_audits_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ingest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ingest_file_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ingest_file_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ingest_file_audits_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ingest_mapping_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
