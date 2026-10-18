-- CreateEnum
CREATE TYPE "AppErrorSource" AS ENUM ('client', 'server');

-- CreateEnum
CREATE TYPE "AppErrorSeverity" AS ENUM ('error', 'warn');

-- CreateTable
CREATE TABLE "app_error_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "userId" TEXT,
    "source" "AppErrorSource" NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "digest" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "severity" "AppErrorSeverity" NOT NULL DEFAULT 'error',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "app_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_error_logs_createdAt_idx" ON "app_error_logs"("createdAt");

-- CreateIndex
CREATE INDEX "app_error_logs_tenantId_createdAt_idx" ON "app_error_logs"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "app_error_logs" ADD CONSTRAINT "app_error_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_error_logs" ADD CONSTRAINT "app_error_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
