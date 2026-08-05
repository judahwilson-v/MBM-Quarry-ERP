import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import packageMetadata from "../../../package.json";
import { getDatabaseFilePath, getDb } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { formatSchemaVersion, parseBuildDate } from "./system-info-utils";

type CountRow = { count: number | bigint };

function readBuildDate() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(process.cwd(), "VERSION"),
    resourcesPath ? path.join(resourcesPath, "VERSION") : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const content = fs.readFileSync(candidate, "utf8");
      const buildDate = parseBuildDate(content);
      if (buildDate !== "Unknown") return buildDate;
    } catch {
      // Try the next packaged/development location.
    }
  }

  return "Unknown";
}

function filesystemMigrationCount() {
  try {
    const migrationsPath = path.join(process.cwd(), "prisma", "migrations");
    return fs.readdirSync(migrationsPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

export async function getSystemInfo() {
  let isSqliteConnected = false;
  let sqliteDetail = "SQLite query failed";
  let recordedMigrationCount = 0;

  try {
    const db = await getDb();
    await db.$queryRaw`SELECT 1`;
    const rows = await db.$queryRawUnsafe<CountRow[]>("SELECT COUNT(*) AS count FROM schema_migrations");
    recordedMigrationCount = Number(rows[0]?.count ?? 0);
    isSqliteConnected = true;
    sqliteDetail = getDatabaseFilePath();
  } catch (error: any) {
    sqliteDetail = error?.message ?? "SQLite query failed";
  }

  const migrationCount = Math.max(recordedMigrationCount, filesystemMigrationCount());
  const modelCount = Object.values(Prisma.ModelName).length;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cloudConfigured = Boolean(
    supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseKey.includes("placeholder"),
  );

  let isCloudSyncEnabled = false;
  let cloudDetail = cloudConfigured ? "Checking..." : "Supabase environment is not configured";

  if (cloudConfigured) {
    try {
      const supabase = createClient();
      const { error: queryError } = await supabase.from("global_settings").select("id").limit(1);
      isCloudSyncEnabled = !queryError;
      cloudDetail = queryError ? queryError.message : "Connected (anonymous sync)";
    } catch (error: any) {
      cloudDetail = error?.message ?? "Supabase connectivity check failed";
    }
  }

  return {
    appVersion: packageMetadata.version,
    buildDate: readBuildDate(),
    dbSchemaVersion: formatSchemaVersion(modelCount, migrationCount),
    syncEngineVersion: `v${packageMetadata.version}`,
    electronVersion: process.versions?.electron || "Development mode",
    databasePath: getDatabaseFilePath(),
    isOfflineReady: isSqliteConnected,
    isCloudSyncEnabled,
    isSqliteConnected,
    sqliteDetail,
    cloudDetail,
  };
}
