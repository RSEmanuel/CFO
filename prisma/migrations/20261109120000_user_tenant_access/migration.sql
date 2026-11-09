-- CreateTable
CREATE TABLE "user_tenant_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tenant_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_access_userId_tenantId_key" ON "user_tenant_access"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "user_tenant_access_tenantId_idx" ON "user_tenant_access"("tenantId");

-- AddForeignKey
ALTER TABLE "user_tenant_access" ADD CONSTRAINT "user_tenant_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenant_access" ADD CONSTRAINT "user_tenant_access_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
