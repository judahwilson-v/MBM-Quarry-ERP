"use server";

import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/utils/serialize";
import { getDb } from "@/lib/prisma";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { enqueueOutboxEvent } from "@/lib/sync/outbox";
import { writeAuditEvent } from "@/lib/domain";
import { verifyEditPassword, requireActor } from "@/app/actions/auth";
import { sanitizeError } from "@/lib/utils/sanitize-error";

export type VehicleInput = {
  id?: string;
  vehicleNumber: string;
  partyName?: string | null;
  companyBodyQty?: string | number | null;
  extraBodyQty?: string | number | null;
  vehicleType?: string | null;
};

function normalizeVehicleNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function cleanText(value?: string | null) {
  const text = value?.trim() ?? "";
  return text || null;
}

function requiredText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function parseNumber(value: string | number | null | undefined, label: string, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
}

function containsSearch(row: Record<string, unknown>, search?: string) {
  const query = search?.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
}

async function upsertPartyByName(tx: Prisma.TransactionClient, partyName: string) {
  const name = partyName.trim();
  if (!name) return;
  const existing = await tx.party.findFirst({
    where: { partyName: { equals: name } },
    select: { id: true },
  });
  if (!existing) {
    const row = await tx.party.create({ data: { partyName: name } });
    try {
      await writeAuditEvent(tx, { entityName: "Party", entityId: row.id, action: "create", role: "system", after: row });
    } catch (e) {
      console.warn("Failed to write audit event for party upsert:", e);
    }
    return row;
  }
  return existing;
}

async function runTx<T>(txFn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await db.$transaction(txFn);
  } finally {
    // Fire-and-forget: don't block the server action response with sync
    setTimeout(() => triggerAutoSync().catch(console.error), 0);
  }
}

export async function listVehicles(search = "") {
  const db = await getDb();
  const rows = await db.vehicle.findMany({ orderBy: { vehicleNumber: "asc" } });
  return serialize(rows.filter((row) => containsSearch(row, search)));
}

export async function saveVehicle(input: VehicleInput) {
  const vehicleNumber = normalizeVehicleNumber(requiredText(input.vehicleNumber, "Vehicle number"));
  const partyName = cleanText(input.partyName);
  const companyBodyQty = parseNumber(input.companyBodyQty, "Company body qty", false);
  const extraBodyQty = parseNumber(input.extraBodyQty, "Extra body qty", false);

  const data = { vehicleNumber, partyName, companyBodyQty, extraBodyQty, vehicleType: cleanText(input.vehicleType) };
  if (input.id) {
    return serialize(await runTx(async (tx) => {
      if (partyName) await upsertPartyByName(tx, partyName);
      const before = await tx.vehicle.findUnique({ where: { id: input.id } });
      const row = await tx.vehicle.update({ where: { id: input.id }, data });
      await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "update", role: "system", before, after: row });
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "update", payload: row });
      return row;
    }));
  }
  return serialize(await runTx(async (tx) => {
    if (partyName) await upsertPartyByName(tx, partyName);
    const row = await tx.vehicle.create({ data });
    await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "create", role: "system", after: row });
    await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "create", payload: row });
    return row;
  }));
}

export async function deleteVehicle(id: string, pin?: string) {
  try {
    if (!pin || !(await verifyEditPassword(pin, "delete"))) {
      throw new Error("Invalid delete PIN");
    }
    await runTx(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id } });
      if (!before) return;
      
      // Check for FK references that would cause constraint violations
      const saleCount = await tx.outgoingSale.count({ where: { vehicleId: id } });
      const boulderCount = await tx.incomingBoulder.count({ where: { vehicleId: id } });
      const fuelCount = await tx.fuelPurchase.count({ where: { vehicleId: id } });
      const total = saleCount + boulderCount + fuelCount;
      if (total > 0) {
        throw new Error(`Cannot delete vehicle "${before.vehicleNumber}" — it has ${saleCount} sale(s), ${boulderCount} boulder purchase(s), and ${fuelCount} fuel record(s). Remove those records first.`);
      }
      
      await tx.vehicle.delete({ where: { id } });
      try {
        await writeAuditEvent(tx, { entityName: "Vehicle", entityId: id, action: "delete", role: "system", before });
      } catch (e) {
        console.warn("Failed to write audit event for vehicle:", e);
      }
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: id, operation: "delete", payload: before });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}

// FULL79: private vehicle CSV import - preview-bound, explicitly reviewed,
// actor-attributed. Built for the owner's real vehicle list (his own file,
// privately held - never embedded in code or tests).
// Contract (bounded):
// - Quote-aware CSV (RFC 4180: quoted fields, "" escapes, commas/newlines in
//   quotes, CRLF, BOM). An unterminated quote makes the record invalid, never
//   silently accepted. Blank rows are skipped; title/comment rows are skipped
//   and reported. A header row (known aliases, any column ORDER) is mapped by
//   column NAME - a reordered header can never swap quantity meanings. A
//   header with missing or unknown columns is rejected truthfully. With no
//   header, the canonical order (vehicle, company body, extra body, type) is
//   used. Data rows must have exactly the header's column count (or 4).
// - Quantities may be blank (null is genuine); present values must be finite
//   non-negative numbers. Nothing is invented.
// - Canonical keys remove ALL whitespace (and uppercase): "ZZQATEST0003" matches
//   stored "ZZ QA TEST 0003"; types compare the same way (PICKUP == PICK UP).
//   Unknown types (not used by any existing vehicle) are invalid rows.
// - Preview writes nothing and returns a previewToken bound to the EXACT file
//   content plus a per-row status snapshot. Commit requires that token: a
//   file never previewed, a changed file, or stale line choices are refused.
//   If the app data drifted since the preview (any row's status changed, e.g.
//   a vehicle was added meanwhile), commit refuses and asks for a fresh
//   preview. Commit also refuses the whole import while any row is invalid
//   or any conflict group lacks an explicit decision (a chosen source line
//   or an explicit "exclude"). Exclusion is per-import, never a standing
//   default; the owner's one-time "delete both" answer covered only the two
//   conflicted groups in his original file (his words, verified in chat).
// - An existing vehicle is never overwritten (db-same skips, db-conflict
//   reports). A real login session is required (requireActor) for both
//   preview and commit; audit rows carry the actor's name, never "system".
// - mode is fail-closed: anything but "preview"/"commit" is refused.

import { createHash } from "crypto";

export type VehicleImportRow = {
  line: number; // physical line where the record starts (1-based)
  vehicleNumber: string; // display form (single-spaced, uppercased)
  groupKey: string; // canonical comparison key
  companyBodyQty: number | null;
  extraBodyQty: number | null;
  vehicleType: string | null;
  status: "create" | "db-same" | "db-conflict" | "duplicate-same" | "conflict" | "excluded" | "invalid";
  note?: string;
};

export type VehicleImportSkipped = { line: number; reason: string };

export type VehicleImportDecision = number | "exclude"; // chosen source line, or explicit exclusion

export type VehicleImportReport = {
  mode: "preview" | "commit";
  totalRows: number; // data rows only (blank/header/comment rows are not counted)
  creates: number;
  skips: number;
  conflicts: number; // rows in unresolved conflicting groups
  invalid: number;
  skippedRows: VehicleImportSkipped[];
  needsReview: string[]; // canonical keys of conflict groups still needing an explicit decision
  previewToken?: string; // commit must return this exact token
  fileError?: string; // whole-file problem (bad header, etc.)
  refused?: string; // truthful reason the commit wrote nothing
  committed?: number;
  rows: VehicleImportRow[];
};

const VEHICLE_HEADER_ALIASES = new Set(["vehicle number", "vehiclenumber", "vehicle no", "vehicle no.", "vehicle"]);
const COMPANY_ALIASES = new Set(["company body", "companybody", "company body qty", "company"]);
const EXTRA_ALIASES = new Set(["with extra body", "extra body", "extrabody", "with extra", "extra"]);
const TYPE_ALIASES = new Set(["type", "vehicle type", "vehicletype"]);

function canonicalVehicleKey(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function canonicalTypeKey(value: string | null) {
  return value === null ? null : value.replace(/\s+/g, "").toUpperCase();
}

function normalizeVehicleType(raw: string | undefined): string | null {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  return text ? text.toUpperCase() : null;
}

function headerKey(cell: string) {
  return cell.trim().replace(/\s+/g, " ").toLowerCase();
}

// Quote-aware CSV record reader. One entry per record with the physical
// start line. `malformed` marks an unterminated quoted field at end of file.
function readCsvRecords(csvText: string): { cells: string[]; line: number; malformed?: boolean }[] {
  const text = csvText.replace(/^\uFEFF/, "");
  const records: { cells: string[]; line: number; malformed?: boolean }[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let line = 1;
  let recordLine = 1;
  const endField = () => { cells.push(field); field = ""; fieldStarted = false; };
  const endRecord = () => { endField(); records.push({ cells, line: recordLine }); cells = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) { inQuotes = true; fieldStarted = true; continue; }
    if (ch === ",") { endField(); continue; }
    if (ch === "\n") { line++; endRecord(); recordLine = line; continue; }
    if (ch === "\r") {
      if (text[i + 1] === "\n") { i++; }
      line++; endRecord(); recordLine = line; continue;
    }
    fieldStarted = true;
    field += ch;
  }
  if (inQuotes) {
    // Unterminated quote: keep the record but mark it malformed so it is
    // reported invalid instead of silently accepted.
    endRecord();
    records[records.length - 1].malformed = true;
  } else if (field !== "" || cells.length > 0 || fieldStarted) {
    endRecord();
  }
  return records;
}

type ColumnMap = { vehicle: number; company: number; extra: number; type: number; width: number };

function resolveHeader(cells: string[]): { map?: ColumnMap; error?: string } {
  const idx: Partial<Record<"vehicle" | "company" | "extra" | "type", number>> = {};
  const seen = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    const h = headerKey(cells[i]);
    const slot = VEHICLE_HEADER_ALIASES.has(h) ? "vehicle" : COMPANY_ALIASES.has(h) ? "company" : EXTRA_ALIASES.has(h) ? "extra" : TYPE_ALIASES.has(h) ? "type" : null;
    if (!slot) return { error: `unknown column "${cells[i].trim()}" in the header row` };
    if (idx[slot] !== undefined) return { error: `column "${cells[i].trim()}" appears twice in the header row` };
    idx[slot] = i;
    seen.add(i);
  }
  for (const need of ["vehicle", "company", "extra", "type"] as const) {
    if (idx[need] === undefined) return { error: `the header row is missing the ${need} column` };
  }
  return { map: { vehicle: idx.vehicle!, company: idx.company!, extra: idx.extra!, type: idx.type!, width: cells.length } };
}

function parseVehicleCsv(csvText: string): { rows: VehicleImportRow[]; skipped: VehicleImportSkipped[]; fileError?: string } {
  const records = readCsvRecords(csvText);
  const rows: VehicleImportRow[] = [];
  const skipped: VehicleImportSkipped[] = [];
  // Locate the header (first record whose first cell is a vehicle alias).
  let colMap: ColumnMap = { vehicle: 0, company: 1, extra: 2, type: 3, width: 4 };
  let headerSeen = false;
  for (const { cells, line, malformed } of records) {
    const trimmed = cells.map((c) => c.trim());
    if (trimmed.every((c) => c === "")) {
      skipped.push({ line, reason: "blank row skipped" });
      continue;
    }
    const aliasHits = trimmed.filter((c) => VEHICLE_HEADER_ALIASES.has(headerKey(c)) || COMPANY_ALIASES.has(headerKey(c)) || EXTRA_ALIASES.has(headerKey(c)) || TYPE_ALIASES.has(headerKey(c))).length;
    const isHeader = trimmed.some((c) => VEHICLE_HEADER_ALIASES.has(headerKey(c))) && aliasHits >= 2;
    if (!headerSeen && isHeader) {
      const resolved = resolveHeader(cells);
      if (resolved.error) return { rows: [], skipped, fileError: `Header problem on line ${line}: ${resolved.error}. Expected columns like "vehicle number, COMPANY BODY, WITH EXTRA BODY, type".` };
      colMap = resolved.map!;
      headerSeen = true;
      skipped.push({ line, reason: "header row skipped" });
      continue;
    }
    if (trimmed[0] !== "" && !/\d/.test(trimmed[0]) && trimmed.filter((c) => c !== "").length === 1) {
      skipped.push({ line, reason: "not a vehicle row (title or comment); skipped" });
      continue;
    }
    const at = (i: number) => trimmed[i] ?? "";
    const display = normalizeVehicleNumber(at(colMap.vehicle));
    const base = { line, vehicleNumber: display, groupKey: canonicalVehicleKey(display) };
    if (malformed) {
      rows.push({ ...base, companyBodyQty: null, extraBodyQty: null, vehicleType: null, status: "invalid", note: "unterminated quoted field" });
      continue;
    }
    if (cells.length !== colMap.width) {
      rows.push({ ...base, companyBodyQty: null, extraBodyQty: null, vehicleType: null, status: "invalid", note: `expected ${colMap.width} columns, found ${cells.length}` });
      continue;
    }
    if (!display) {
      rows.push({ ...base, vehicleNumber: "", groupKey: "", companyBodyQty: null, extraBodyQty: null, vehicleType: null, status: "invalid", note: "vehicle number is blank" });
      continue;
    }
    const qty = (v: string): number | null | "ERR" => {
      if (v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : "ERR";
    };
    const c = qty(at(colMap.company));
    const e = qty(at(colMap.extra));
    if (c === "ERR" || e === "ERR") {
      rows.push({ ...base, companyBodyQty: null, extraBodyQty: null, vehicleType: null, status: "invalid", note: "quantity is not a valid non-negative number" });
      continue;
    }
    const type = normalizeVehicleType(at(colMap.type));
    if (type !== null && (type.length > 40 || !/^[A-Z0-9][A-Z0-9 /-]*$/.test(type))) {
      rows.push({ ...base, companyBodyQty: c, extraBodyQty: e, vehicleType: type, status: "invalid", note: "vehicle type has unsupported characters" });
      continue;
    }
    rows.push({ ...base, companyBodyQty: c, extraBodyQty: e, vehicleType: type, status: "create" });
  }
  return { rows, skipped };
}

// Preview bindings: token -> { fileHash, snapshot of per-line statuses and relevant values }.
// Server-process-local, 30 minute expiry, same pattern as the auth lockout
// maps. A commit is bound to the exact previewed file and its review state.
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previewBindings = new Map<string, { fileHash: string; actorId: string | null; snapshot: { line: number; fingerprint: string }[]; at: number }>();

function fileHashOf(csvText: string) {
  return createHash("sha256").update(csvText, "utf8").digest("hex");
}

function buildReport(rows: VehicleImportRow[], skipped: VehicleImportSkipped[], mode: "preview" | "commit", previewToken?: string): VehicleImportReport {
  const byKey = new Map<string, VehicleImportRow[]>();
  for (const r of rows) {
    if (r.status === "invalid") continue;
    const g = byKey.get(r.groupKey) ?? [];
    g.push(r);
    byKey.set(r.groupKey, g);
  }
  return {
    mode,
    totalRows: rows.length,
    creates: rows.filter((r) => r.status === "create").length,
    skips: rows.filter((r) => r.status === "db-same" || r.status === "duplicate-same" || r.status === "excluded").length,
    conflicts: rows.filter((r) => r.status === "conflict").length + rows.filter((r) => r.status === "db-conflict").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    skippedRows: skipped,
    needsReview: [...byKey.entries()].filter(([, g]) => g.some((r) => r.status === "conflict")).map(([k]) => k),
    previewToken,
    rows,
  };
}

function sweepPreviews() {
  const now = Date.now();
  for (const [k, v] of previewBindings) if (now - v.at > PREVIEW_TTL_MS) previewBindings.delete(k);
}

export async function importVehiclesCsv(
  csvText: string,
  mode: "preview" | "commit",
  decisions?: Record<string, VehicleImportDecision>, // canonical group key -> chosen line or "exclude"
  sessionToken?: string | null,
  previewToken?: string | null,
): Promise<VehicleImportReport> {
  if (mode !== "preview" && mode !== "commit") {
    return {
      mode: "commit", totalRows: 0, creates: 0, skips: 0, conflicts: 0, invalid: 0,
      skippedRows: [], needsReview: [], rows: [],
      refused: `Unknown import mode "${String(mode)}". Nothing was imported.`,
    };
  }
  let actor: { id: string; name: string; role: string } | null = null;
  try {
    actor = await requireActor(sessionToken);
  } catch (error) {
    return {
      mode, totalRows: 0, creates: 0, skips: 0, conflicts: 0, invalid: 0,
      skippedRows: [], needsReview: [], rows: [],
      refused: sanitizeError(error),
    };
  }

  const { rows, skipped, fileError } = parseVehicleCsv(csvText);
  if (fileError) {
    return {
      mode, totalRows: 0, creates: 0, skips: 0, conflicts: 0, invalid: 0,
      skippedRows: skipped, needsReview: [], rows: [], fileError,
      refused: mode === "commit" ? `Import refused: ${fileError} Nothing was imported.` : undefined,
    };
  }

  // Classification: grouping, DB compare and type checks, parameterized by
  // decisions so a commit can first re-classify WITHOUT decisions to detect
  // real drift since the preview, then apply the reviewer's decisions.
  const db = await getDb();
  const existing = await db.vehicle.findMany();
  const classify = (target: VehicleImportRow[], dec?: Record<string, VehicleImportDecision>) => {
    for (const r of target) { if (r.status !== "invalid") { r.status = "create"; r.note = undefined; } }
    const byKey = new Map<string, VehicleImportRow[]>();
    for (const r of target) {
      if (r.status === "invalid") continue;
      const g = byKey.get(r.groupKey) ?? [];
      g.push(r);
      byKey.set(r.groupKey, g);
    }
    for (const [key, group] of byKey) {
      if (group.length < 2) continue;
      const same = group.every((r) => r.companyBodyQty === group[0].companyBodyQty && r.extraBodyQty === group[0].extraBodyQty && canonicalTypeKey(r.vehicleType) === canonicalTypeKey(group[0].vehicleType));
      if (same) {
        for (let i = 1; i < group.length; i++) {
          group[i].status = "duplicate-same";
          group[i].note = `identical repeat of line ${group[0].line}; only line ${group[0].line} is kept`;
        }
      } else {
        // Conflicting duplicate: NEVER pick silently.
        const decision = dec?.[key];
        const chosen = typeof decision === "number" ? group.find((r) => r.line === decision) : undefined;
        for (const r of group) {
          if (chosen && r.line === chosen.line) {
            r.note = `chosen from a conflicting duplicate group (lines ${group.map((g) => g.line).join(", ")})`;
          } else if (chosen) {
            r.status = "excluded";
            r.note = `not chosen from the conflicting duplicate group (lines ${group.map((g) => g.line).join(", ")}); line ${chosen.line} was picked on review`;
          } else if (decision === "exclude") {
            r.status = "excluded";
            r.note = `conflicting duplicate (lines ${group.map((g) => g.line).join(", ")}) explicitly excluded on review`;
          } else {
            r.status = "conflict";
            r.note = `conflicting duplicate of ${r.vehicleNumber} (lines ${group.map((g) => g.line).join(", ")}); review and choose a line or explicitly exclude the group`;
          }
        }
      }
    }
    const existingByKey = new Map(existing.map((v) => [canonicalVehicleKey(v.vehicleNumber), v]));
    for (const r of target) {
      if (r.status !== "create") continue;
      const ex = existingByKey.get(r.groupKey);
      if (!ex) continue;
      const same = (ex.companyBodyQty ?? null) === r.companyBodyQty && (ex.extraBodyQty ?? null) === r.extraBodyQty && canonicalTypeKey(ex.vehicleType ?? null) === canonicalTypeKey(r.vehicleType);
      if (same) {
        r.status = "db-same";
        r.note = "already in the app with the same values; skipped";
      } else {
        r.status = "db-conflict";
        r.note = `already in the app with different values (company body ${ex.companyBodyQty ?? "-"}, extra body ${ex.extraBodyQty ?? "-"}, type ${ex.vehicleType ?? "-"}); not overwritten`;
      }
    }
    // Unknown types are invalid rows, not silently invented master data.
    const knownTypes = new Set(existing.map((v) => canonicalTypeKey(v.vehicleType ?? null)).filter((t): t is string => t !== null));
    for (const r of target) {
      if (r.status !== "create" || r.vehicleType === null) continue;
      if (!knownTypes.has(canonicalTypeKey(r.vehicleType) as string)) {
        r.status = "invalid";
        r.note = `vehicle type "${r.vehicleType}" is not used by any vehicle in the app yet; add it on a vehicle first or fix the file`;
      }
    }
  };

  // Preserve exactly the relevant app values the reviewer saw, including
  // conflicts that stay conflicts after an intervening edit. No transaction
  // isolation or post-read race guarantee is implied by this preview check.
  const reviewedFingerprint = (r: VehicleImportRow) => JSON.stringify({
    row: [r.line, r.status, r.vehicleNumber, r.groupKey, r.companyBodyQty, r.extraBodyQty, r.vehicleType],
    existing: existing.filter((v) => canonicalVehicleKey(v.vehicleNumber) === r.groupKey)
      .map((v) => [v.id, v.vehicleNumber, v.companyBodyQty ?? null, v.extraBodyQty ?? null, v.vehicleType ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  const fileHash = fileHashOf(csvText);
  sweepPreviews();
  if (mode === "preview") {
    classify(rows, undefined);
    const token = createHash("sha256").update(`${fileHash}:${Math.random()}:${Date.now()}`, "utf8").digest("hex");
    // Bound to the exact file, the per-line review state AND this actor.
    previewBindings.set(token, { fileHash, actorId: actor ? actor.id : null, snapshot: rows.map((r) => ({ line: r.line, fingerprint: reviewedFingerprint(r) })), at: Date.now() });
    return buildReport(rows, skipped, "preview", token);
  }

  // Commit must be bound to a preview of THIS exact file by THIS actor.
  const binding = previewToken ? previewBindings.get(previewToken) : undefined;
  if (!binding || binding.fileHash !== fileHash) {
    const r0 = buildReport(rows, skipped, "commit");
    r0.refused = "Import refused: run Preview on this exact file first. Previews are single-use and expire after 30 minutes; nothing was imported.";
    r0.committed = 0;
    return r0;
  }
  if (binding.actorId !== (actor ? actor.id : null)) {
    const r0 = buildReport(rows, skipped, "commit");
    r0.refused = "Import refused: this preview belongs to a different login. Preview again as yourself; nothing was imported.";
    r0.committed = 0;
    return r0;
  }
  // Real drift check: re-classify WITHOUT decisions and require the exact
  // same per-line state the reviewer saw. No broad skip: any line whose
  // status changed for a reason other than the reviewer's own decision is
  // stale review and refuses the commit.
  const probe = rows.map((r) => ({ ...r }));
  classify(probe, undefined);
  const before = new Map(binding.snapshot.map((s) => [s.line, s.fingerprint]));
  const drift = probe.filter((r) => before.get(r.line) !== reviewedFingerprint(r));
  if (drift.length > 0) {
    const r0 = buildReport(rows, skipped, "commit");
    r0.refused = `Import refused: the app data changed since your preview (${drift.map((r) => `line ${r.line}`).join(", ")} changed). Run Preview again to review the current state; nothing was imported.`;
    r0.committed = 0;
    return r0;
  }

  classify(rows, decisions);

  const invalidRows = rows.filter((r) => r.status === "invalid");
  const report = buildReport(rows, skipped, "commit");

  if (invalidRows.length > 0) {
    report.refused = `Import refused: ${invalidRows.length} row(s) are invalid (${invalidRows.map((r) => `line ${r.line}`).join(", ")}). Fix the file and run the preview again; nothing was imported.`;
    report.committed = 0;
    return report;
  }
  if (report.needsReview.length > 0) {
    const pending = rows.filter((r) => r.status === "conflict");
    report.refused = `Import refused: ${report.needsReview.length} conflicting duplicate group(s) still need a review decision (${pending.map((r) => `line ${r.line}`).join(", ")}). Choose a line or explicitly exclude each group; nothing was imported.`;
    report.committed = 0;
    return report;
  }
  // Atomic single-use claim: exactly one concurrent commit can claim the
  // token (no await between the check and the delete). A second claimant is
  // refused truthfully instead of double-importing from one review.
  if (!previewBindings.delete(previewToken!)) {
    report.refused = "Import refused: this preview was already used by another commit. Run Preview again; nothing was imported.";
    report.committed = 0;
    return report;
  }
  const toCreate = rows.filter((r) => r.status === "create");
  await runTx(async (tx) => {
    for (const r of toCreate) {
      const data = { vehicleNumber: r.vehicleNumber, companyBodyQty: r.companyBodyQty, extraBodyQty: r.extraBodyQty, vehicleType: r.vehicleType };
      const row = await tx.vehicle.create({ data });
      await writeAuditEvent(tx, { entityName: "Vehicle", entityId: row.id, action: "create", role: actor ? actor.name : undefined, after: { ...row, importedFromLine: r.line } });
      await enqueueOutboxEvent(tx, { entityType: "Vehicle", entityId: row.id, operation: "create", payload: row });
    }
  });
  report.committed = toCreate.length;
  return report;
}
