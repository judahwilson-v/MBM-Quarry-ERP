import assert from "node:assert/strict";
import { formatSchemaVersion, parseBuildDate } from "@/lib/system/system-info-utils";

assert.equal(parseBuildDate("VERSION=1.9.7\nBUILD_DATE=2026-07-04 23:09\n"), "2026-07-04 23:09");
assert.equal(parseBuildDate("VERSION=1.9.7\n"), "Unknown");
assert.equal(formatSchemaVersion(24, 1), "24 models / 1 migration");
assert.equal(formatSchemaVersion(24, 2), "24 models / 2 migrations");

console.log("system information tests passed");
