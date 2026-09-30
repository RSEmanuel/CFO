import { prisma } from "@/lib/prisma";
import { BUILTIN_PROFILES } from "@/services/ingest/builtinProfiles";
import { profileFromRecord } from "@/services/ingest/applyMapping";
import type { MappingProfileShape } from "@/services/ingest/types";
import { Prisma } from "@/generated/prisma/client";

export const BUILTINS: readonly MappingProfileShape[] = BUILTIN_PROFILES;

function json(profile: MappingProfileShape) {
  return {
    id: profile.id,
    tenantId: profile.tenantId,
    origin: profile.origin,
    profileKey: profile.profileKey,
    version: profile.version,
    isActive: profile.isActive,
    fingerprintHash: profile.fingerprintHash,
    name: profile.name,
    sourceSystem: profile.sourceSystem,
    documentType: profile.documentType,
    headerRow: profile.headerRow,
    sheetMatch: profile.sheetMatch,
    columnMap: profile.columnMap as Prisma.InputJsonValue,
    enumMap: profile.enumMap as Prisma.InputJsonValue,
    accountPrefixRules: profile.accountPrefixRules === null
      ? Prisma.JsonNull
      : profile.accountPrefixRules as Prisma.InputJsonValue,
    accountRoles: profile.accountRoles === null
      ? Prisma.JsonNull
      : profile.accountRoles as unknown as Prisma.InputJsonValue,
    matcherConfig: profile.matcherConfig as Prisma.InputJsonValue,
    flujoConfig: profile.flujoConfig === null
      ? Prisma.JsonNull
      : profile.flujoConfig as unknown as Prisma.InputJsonValue,
    partidaDobleMode: profile.partidaDobleMode,
    bridgeTesoreriaFromBalanza: profile.bridgeTesoreriaFromBalanza,
  };
}

export async function registerBuiltinProfiles(): Promise<void> {
  for (const profile of BUILTINS) {
    try {
      await prisma.ingestMappingProfile.create({ data: json(profile) });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }
  }
}

export async function createTenantProfile(
  tenantId: string,
  profile: Omit<MappingProfileShape, "id" | "origin" | "tenantId" | "version" | "fingerprintHash">,
): Promise<MappingProfileShape> {
  const latest = await prisma.ingestMappingProfile.findFirst({
    where: { tenantId, origin: "TENANT", profileKey: profile.profileKey },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const { createHash } = await import("node:crypto");
  const fingerprintHash = createHash("sha256")
    .update(JSON.stringify({ profileKey: profile.profileKey, version, matcherConfig: profile.matcherConfig, columnMap: profile.columnMap }))
    .digest("hex");
  const tenantShape = json({
    ...profile,
    id: "generated",
    origin: "TENANT",
    tenantId,
    version,
    fingerprintHash,
  });
  const { id: _generatedId, ...data } = tenantShape;
  const row = await prisma.ingestMappingProfile.create({
    data,
  });
  return profileFromRecord(row);
}

export async function deactivateTenantProfile(tenantId: string, profileId: string): Promise<void> {
  await prisma.ingestMappingProfile.updateMany({
    where: { id: profileId, tenantId, origin: "TENANT" },
    data: { isActive: false },
  });
}

export async function listEffectiveProfiles(tenantId: string): Promise<MappingProfileShape[]> {
  await registerBuiltinProfiles();
  const rows = await prisma.ingestMappingProfile.findMany({
    where: {
      isActive: true,
      OR: [
        { origin: "BUILTIN", tenantId: null },
        { origin: "TENANT", tenantId },
      ],
    },
    orderBy: [{ profileKey: "asc" }, { version: "desc" }],
  });
  return rows.map(profileFromRecord);
}

export async function loadProfileById(tenantId: string, profileId: string): Promise<MappingProfileShape | null> {
  await registerBuiltinProfiles();
  const row = await prisma.ingestMappingProfile.findFirst({
    where: {
      id: profileId,
      isActive: true,
      OR: [{ origin: "BUILTIN", tenantId: null }, { origin: "TENANT", tenantId }],
    },
  });
  return row ? profileFromRecord(row) : null;
}
