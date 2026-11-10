/**
 * FULL63: no automatic stale-marker reclaim anywhere. begin only ever REFUSES
 * when a marker exists (live, dead, released, or unverifiable); the only place
 * the shared marker may be removed is a process-start/lifecycle sweep, which
 * keeps live-foreign and unverifiable markers fail-closed. This replaces the
 * FULL61 fd-bound reclaim, which a deterministic same-inode schedule could
 * double-admit (QA reproduction). These tests pin the new contract.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const fixturePath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
const markerFile = fixturePath + ".restart-required";

async function rs() {
  return import("@/lib/sync/restore-state");
}
function deadPid(): number {
  const { spawnSync } = require("node:child_process");
  return spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" }).pid;
}
function cleanup() {
  try { fs.rmSync(markerFile, { force: true }); } catch { /* ignore */ }
}

describe("FULL63 stale-marker recovery without automatic reclaim", () => {
  it("begin performs NO mutation on an existing marker (dead, live, abandoned, unverifiable)", async () => {
    const m = await rs();
    m.clearRestartRequiredForProcessStart();
    const cases: Array<[string, string, RegExp]> = [
      ["dead", JSON.stringify({ pid: deadPid(), at: new Date().toISOString(), token: "stale" }), /Restart the application/],
      ["live foreign", JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "foreign" }), /Another operation holds/],
      ["released", JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "ours", abandoned: true }), /Restart the application/],
      ["unverifiable", "not json", /cannot be verified/],
    ];
    for (const [label, payload, pattern] of cases) {
      cleanup();
      fs.writeFileSync(markerFile, payload);
      // Any attempt by begin to mutate the marker path fails this test.
      const calls: string[] = [];
      const origRm = fs.rmSync, origTrunc = fs.ftruncateSync, origRename = fs.renameSync, origWrite = fs.writeFileSync;
      (fs as any).rmSync = (p: any, ...a: any[]) => { calls.push(`rm:${p}`); return origRm.call(fs, p, ...a); };
      (fs as any).ftruncateSync = (...a: any[]) => { calls.push("ftruncate"); return (origTrunc as any)(...a); };
      (fs as any).renameSync = (a1: any, b1: any) => { calls.push(`rename:${a1}->${b1}`); return origRename.call(fs, a1, b1); };
      try {
        expect(() => m.beginRestartIntent(), label).toThrow(pattern);
      } finally {
        (fs as any).rmSync = origRm; (fs as any).ftruncateSync = origTrunc; (fs as any).renameSync = origRename; (fs as any).writeFileSync = origWrite;
      }
      // Only our own unique temp file may have been written/removed; the
      // marker itself is byte-intact.
      expect(fs.readFileSync(markerFile, "utf8"), label).toBe(payload);
      expect(calls.filter((c) => c.includes(".restart-required") && !c.includes(".tmp")), label).toEqual([]);
    }
    cleanup();
  });

  it("recovery: dead marker -> begin refuses -> process-start sweep clears -> begin succeeds", async () => {
    const m = await rs();
    m.clearRestartRequiredForProcessStart();
    cleanup();
    fs.writeFileSync(markerFile, JSON.stringify({ pid: deadPid(), at: new Date().toISOString(), token: "stale" }));
    expect(() => m.beginRestartIntent()).toThrow(/Restart the application/);
    m.clearStaleBarrierAtProcessStart();
    expect(fs.existsSync(markerFile)).toBe(false);
    const token = m.beginRestartIntent();
    m.abandonRestartIntent(token); // released in place, inert
    expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).abandoned).toBe(true);
    m.clearStaleBarrierAtProcessStart(); // released markers are swept too
    expect(fs.existsSync(markerFile)).toBe(false);
    cleanup();
  });

  it("the sweep keeps a live foreign marker and an unverifiable marker (fail-closed)", async () => {
    const m = await rs();
    cleanup();
    const foreign = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "foreign-live" });
    fs.writeFileSync(markerFile, foreign);
    m.clearStaleBarrierAtProcessStart();
    expect(fs.readFileSync(markerFile, "utf8")).toBe(foreign); // untouched
    fs.writeFileSync(markerFile, "garbage{");
    m.clearStaleBarrierAtProcessStart();
    expect(fs.readFileSync(markerFile, "utf8")).toBe("garbage{"); // kept fail-closed
    cleanup();
  });

  it("abandon never unlinks a foreign replacement installed mid-neutralize", async () => {
    const m = await rs();
    m.clearRestartRequiredForProcessStart();
    cleanup();
    const token = m.beginRestartIntent();
    const foreignPayload = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "foreign-during-abandon" });
    const origTrunc = fs.ftruncateSync;
    let fired = false;
    (fs as any).ftruncateSync = function (fd: number, len?: number) {
      if (!fired) {
        fired = true;
        const tmpF = markerFile + ".foreign2.tmp";
        origWrite(tmpF, foreignPayload);
        fs.renameSync(tmpF, markerFile);
      }
      return origTrunc.call(fs, fd, len as number);
    };
    const origWrite = fs.writeFileSync;
    try {
      m.abandonRestartIntent(token);
    } finally {
      (fs as any).ftruncateSync = origTrunc;
    }
    expect(fired).toBe(true);
    expect(fs.readFileSync(markerFile, "utf8")).toBe(foreignPayload); // intact
    expect(() => m.assertRestartNotRequired()).toThrow(/Restart the application/); // live foreign barrier holds
    cleanup();
    m.clearRestartRequiredForProcessStart();
  });
});
