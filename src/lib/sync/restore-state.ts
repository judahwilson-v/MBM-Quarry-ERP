import fs from "fs";
import { randomUUID } from "crypto";
import path from "path";
let restoreInProgress = false;
let activeRestoreToken: object | null = null;

export function assertRestoreIsNotInProgress() {
  if (restoreInProgress) throw new Error("A database restore is in progress. Try again after it completes.");
}

// beginRestore returns an opaque session token to the restore owner ONLY. The token
// is the scoped capability that lets the restore machinery itself reach the internal
// (ungated) client while the public barrier refuses every other query. It cannot be
// forged from outside the module and dies with endRestore.
export function beginRestore(): object | null {
  if (restoreInProgress) return null;
  restoreInProgress = true;
  activeRestoreToken = {};
  return activeRestoreToken;
}

export function endRestore() {
  restoreInProgress = false;
  activeRestoreToken = null;
}

export function isActiveRestoreToken(token: unknown): boolean {
  return restoreInProgress && token !== null && token === activeRestoreToken;
}

let restartRequired = false;

// FULL57 root-cause fix for the FULL55/FULL56 restart-barrier HTTP bypass:
// the barrier used to be in-process module state only. Next.js compiles
// server actions and route handlers into SEPARATE bundles, so a restore
// (server action bundle) marked one module instance while the database
// export/import routes (route-handler bundle) read another instance and saw
// the barrier as clear - actual HTTP probes returned 200 after a restore.
// The barrier is now backed by a durable marker FILE beside the database,
// shared by every bundle instance in this OS process. The marker carries the
// restoring process's PID: a restarted application is a NEW process, so the
// first barrier check in the new process finds a foreign-PID marker, treats
// it as stale, removes it, and operates normally on the restored database.
// Scope note: the barrier is per OS process (as the old in-memory one was);
// a second app instance already running against the same DB file is not
// covered. PID wraparound could theoretically lift the barrier early; the
// restoring process is short-lived after a restore in practice.

function markerPath(): string {
  const dbUrl = process.env.DATABASE_URL || `file:${path.resolve(process.cwd(), "prisma", "local.db")}`;
  return dbUrl.replace(/^file:/, "") + ".restart-required";
}

/** After a successful database-file restore, every further query in this process must refuse until restart. */
export function markRestartRequired() {
  // Write the durable marker first so every bundle instance sees it even if
  // this call is followed by more work in the restoring bundle.
  try {
    const target = markerPath();
    const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), reason: "database restore" });
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, payload);
      try {
        fs.linkSync(tmp, target); // atomic exclusive install: never overwrites
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        // FULL63: never clobber or reclaim an existing marker; the in-memory
        // barrier below still protects this process, and the failure is loud.
        throw new Error("restart marker already exists; refusing to overwrite it");
      }
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    }
  } catch (error) {
    // The database file is already swapped at this point; refuse loudly in
    // this bundle via the in-memory flag below and surface the marker
    // failure rather than hiding a half-guarded state.
    console.error("[restore-state] could not write restart-required marker:", error);
  }
  restartRequired = true;
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === "EPERM"; }
}

interface RestartMarker { pid: number; at?: string; reason?: string; token?: string; abandoned?: boolean }

function parseMarker(buf: string): RestartMarker | null {
  try {
    const raw = JSON.parse(buf);
    return raw && typeof raw.pid === "number" ? raw : null;
  } catch { return null; }
}

function readMarker(): RestartMarker | null {
  try { return parseMarker(fs.readFileSync(markerPath(), "utf8")); } catch { return null; }
}

type MarkerInspection =
  | { kind: "none" }
  | { kind: "live"; marker: RestartMarker }
  | { kind: "dead"; marker: RestartMarker }
  | { kind: "abandoned"; marker: RestartMarker }
  | { kind: "unverifiable" };

/** Read and classify the marker without mutating anything. */
function inspectMarkerFd(target: string): MarkerInspection {
  let raw: string;
  try {
    raw = fs.readFileSync(target, "utf8");
  } catch {
    return { kind: "none" };
  }
  const marker = parseMarker(raw);
  if (!marker) return { kind: "unverifiable" };
  if (marker.abandoned) return { kind: "abandoned", marker };
  return isAlive(marker.pid) ? { kind: "live", marker } : { kind: "dead", marker };
}

/**
 * FULL63: process-start/lifecycle sweep - the ONLY place the shared marker
 * may be removed. Removing at process start is the documented safe point: in
 * the supported single-instance deployment no restore can be in flight and no
 * acquirer can exist in this process at that instant. A live foreign marker
 * and an unverifiable marker are kept (fail closed); a dead or released
 * (abandoned) marker is removed; a marker owned by THIS live process (hot
 * reload / tests) is neutralized in place, never unlinked. The residual
 * window (a second app instance concurrently writing the same database
 * directory) is outside the deployment scope documented above and is not
 * claimed solved.
 */
function sweepStaleMarker(target: string, neutralizeOwnLive: boolean): void {
  const found = inspectMarkerFd(target);
  if (found.kind === "none" || found.kind === "live" && found.marker.pid !== process.pid || found.kind === "unverifiable") {
    if (found.kind !== "live" || !neutralizeOwnLive || found.marker.pid !== process.pid) return;
  }
  if (found.kind === "dead" || found.kind === "abandoned") {
    try { fs.rmSync(target, { force: true }); } catch { /* fail-closed: leave it */ }
    return;
  }
  if (found.kind === "live" && found.marker.pid === process.pid && neutralizeOwnLive) {
    // Same-process lifecycle reset: neutralize in place, fd-bound.
    try {
      const fd = fs.openSync(target, "r+");
      try {
        fs.ftruncateSync(fd, 0);
        fs.writeSync(fd, JSON.stringify({ ...found.marker, abandoned: true }), 0, "utf8");
        fs.fsyncSync(fd);
      } finally {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
    } catch { /* fail-closed */ }
  }
}

/**
 * FULL58: durable restart INTENT, established BEFORE any restore machinery
 * touches the active database file. If this marker cannot be persisted the
 * restore is aborted with the database untouched, so a completed swap can
 * never exist without its durable barrier. The returned token owns the
 * marker: finalize/abandon only act on a marker carrying the same token and
 * never remove another operation's marker. Any write failure throws - the
 * caller treats an unpersistable intent as "restore refused".
 */
export function beginRestartIntent(reason = "database restore intent"): string {
  const token = randomUUID();
  const target = markerPath();
  // Unique per-attempt temp name: a pre-existing or concurrently created temp
  // path (including a directory) can never collide with this write.
  const tmp = `${target}.${token}.tmp`;
  // FULL59 (QA fault correction): acquisition is ATOMIC and EXCLUSIVE. The
  // payload is staged in the temp file, then installed with linkSync, which
  // fails with EEXIST if any marker already exists at the target - a rename
  // would silently overwrite a foreign live marker inserted between a
  // check and the install. FULL63: on EEXIST begin only REFUSES (live, dead,
  // released, or unverifiable - see the messages below); it never reclaims,
  // unlinks, or overwrites an existing marker. The temp file is removed in
  // finally and is never left behind.
  try {
    fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), reason, token }));
    try {
      fs.linkSync(tmp, target);
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      // FULL63 (QA correction): NO automatic reclaim of a stale marker. The
      // FULL61 fd-bound reclaim still admitted a deterministic same-inode
      // double-reclaimer schedule (stale outer read -> inner reclaims and
      // verifies -> outer overwrites the now-live claim; both admitted), and
      // no path-based unlink/rename can be race-free against a concurrent
      // writer. So begin only ever REFUSES, with an honest recovery route:
      // process start (bootstrap) clears dead/released markers - see
      // clearStaleBarrierAtProcessStart. This cannot lock restores out
      // permanently: an ordinary restart clears a dead marker, a live marker
      // is genuinely held, and an unverifiable marker needs operator file
      // removal (stated, fail-closed).
      const fdResult = inspectMarkerFd(target);
      if (fdResult.kind === "live") throw new Error("Another operation holds the restart barrier; refusing to begin a restore.");
      if (fdResult.kind === "dead") throw new Error("A previous restore did not complete. Restart the application to clear the barrier, then retry.");
      if (fdResult.kind === "abandoned") throw new Error("A previous restore was rolled back. Restart the application to clear the barrier, then retry.");
      throw new Error("A restart marker exists but cannot be verified; refusing to begin a restore.");
    }
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
  }
  return token;
}

/** Commit the intent after a successful swap: only the owning token may finalize; a finalize failure throws so the caller rolls the restore back. The intent marker written at begin IS already the complete durable barrier (live PID + ownership token), so finalize performs NO file mutation: it cannot leave temp debris behind and cannot clobber another operation's marker. */
export function finalizeRestartIntent(token: string): void {
  const existing = readMarker();
  if (!existing || existing.token !== token || existing.abandoned) {
    throw new Error("Restart marker ownership lost during restore; refusing to finalize.");
  }
  restartRequired = true;
}

/** Abandon our intent when a restore is rolled back. Removes the marker only if it still carries our token - another operation's marker is never removed. A removal failure is left fail-closed (barrier stays; process must restart). */
export function abandonRestartIntent(token: string): void {
  // FULL61: abandon NEVER unlinks the shared marker (a foreign replacement
  // installed between a read and an unlink would be destroyed with it). It
  // neutralizes our own marker IN PLACE via one open file description: the
  // marker stays at the path carrying abandoned:true, which barrier checks
  // treat as inert. If the path was replaced meanwhile our write touched only
  // the orphaned inode and the foreign marker is byte-intact.
  const target = markerPath();
  let fd: number;
  try {
    fd = fs.openSync(target, "r+");
  } catch {
    return; // already gone: nothing to abandon
  }
  try {
    const st = fs.fstatSync(fd);
    const buf = Buffer.alloc(st.size);
    if (st.size > 0) fs.readSync(fd, buf, 0, st.size, 0);
    const existing = parseMarker(buf.toString("utf8"));
    if (!existing || existing.token !== token) return; // not ours: do not touch
    const payload = JSON.stringify({ ...existing, abandoned: true });
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, payload, 0, "utf8");
    fs.fsyncSync(fd);
    try {
      const now = fs.statSync(target);
      if (now.dev !== st.dev || now.ino !== st.ino) return; // foreign replacement: orphan write only
    } catch { /* path gone: nothing further to do */ }
  } catch {
    // fail-closed: the barrier stays in place
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

export function assertRestartNotRequired() {
  if (restartRequired) {
    throw new Error("Database was restored. Restart the application to continue.");
  }
  const marker = markerPath();
  if (!fs.existsSync(marker)) return;
  const parsed = parseMarker(fs.readFileSync(marker, "utf8"));
  if (!parsed) {
    // Unreadable/unverifiable marker: refuse rather than guess.
    throw new Error("Database was restored. Restart the application to continue.");
  }
  if (!parsed.abandoned && isAlive(parsed.pid)) {
    // A live barrier (this process's own restore, or a live foreign owner).
    throw new Error("Database was restored. Restart the application to continue.");
  }
  // FULL61: a dead-owner or explicitly abandoned marker is INERT. Barrier
  // checks never remove markers (a check-then-unlink window could destroy a
  // foreign live marker installed in between); the stale file is harmless and
  // a later beginRestartIntent reclaims that exact inode in place.
}

/** Process-start lifecycle hook (fresh process, hot reload, tests): clears the barrier and its durable marker. */
export function clearRestartRequiredForProcessStart() {
  restartRequired = false;
  // FULL63: lifecycle reset sweeps stale markers (see sweepStaleMarker): dead
  // or released markers are removed, this process's own live marker (hot
  // reload / tests) is neutralized in place, and a live foreign or
  // unverifiable marker is kept fail-closed.
  sweepStaleMarker(markerPath(), true);
}

/**
 * FULL63: real production caller support - called once per process from
 * database bootstrap (initializeDatabase). Preserves the ordinary real-restart
 * contract: a crashed restore leaves a dead marker, the next process's
 * bootstrap removes it, and restores are available again. Never touches a
 * live or unverifiable marker.
 */
export function clearStaleBarrierAtProcessStart(): void {
  sweepStaleMarker(markerPath(), false);
}
