import type { MappingProfileShape } from "@/services/ingest/types";

export function combineEffectiveProfiles(
  tenantId: string,
  builtinProfiles: MappingProfileShape[],
  tenantProfiles: MappingProfileShape[],
): MappingProfileShape[] {
  return [
    ...builtinProfiles.filter((profile) => profile.origin === "BUILTIN" && profile.tenantId === null && profile.isActive),
    ...tenantProfiles.filter((profile) => profile.origin === "TENANT" && profile.tenantId === tenantId && profile.isActive),
  ];
}
