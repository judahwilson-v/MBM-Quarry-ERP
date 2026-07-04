export function parseBuildDate(versionFileContent: string) {
  return versionFileContent.match(/^BUILD_DATE=(.+)$/m)?.[1].trim() ?? "Unknown";
}

export function formatSchemaVersion(modelCount: number, migrationCount: number) {
  return `${modelCount} models / ${migrationCount} migration${migrationCount === 1 ? "" : "s"}`;
}
