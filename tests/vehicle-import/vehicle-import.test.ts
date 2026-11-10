// FULL77 vehicle CSV import. SYNTHETIC fixtures only - no real registration
// numbers, no real company data; the owner's actual file stays private.
// Covers the FULL76 independent QA findings: quote-aware parsing, preamble /
// header skipping, canonical missing-space matching, type canonicalization,
// session/actor gate, and explicit per-group review before commit.
import { describe, it, expect, vi, beforeAll } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PrismaClient } from "@prisma/client";
import { importVehiclesCsv, listVehicles } from "@/app/actions/vehicles";

const prisma = new PrismaClient();
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const csv = (rows: string[]) => "vehicle number,COMPANY BODY,WITH EXTRA BODY,type\n" + rows.join("\n") + "\n";
const v = (tag: string) => `ZZ ${RUN} T ${tag}`; // synthetic series, never a real plate
const key = (s: string) => s.replace(/\s+/g, "").toUpperCase();

// FULL79: every commit is bound to a preview of the exact same file content.
async function boundCommit(text: string, decisions?: Record<string, number | "exclude">, token: string | null = TOKEN) {
  const preview = await importVehiclesCsv(text, "preview", undefined, token);
  return importVehiclesCsv(text, "commit", decisions, token, preview.previewToken);
}

let TOKEN = "";
const IMPORTER = `QA Importer ${RUN}`;

async function allTables() {
  const ts: any[] = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const o: any = {};
  for (const t of ts) o[t.name] = await prisma.$queryRawUnsafe('SELECT * FROM "' + t.name + '" ORDER BY rowid');
  return o;
}

beforeAll(async () => {
  // Enrolled install + a real worker session, so the actor gate has something
  // truthful to resolve. Synthetic name only.
  await prisma.appMeta.upsert({ where: { key: "worker_enrollment_completed" }, create: { key: "worker_enrollment_completed", value: "true" }, update: { value: "true" } });
  const user = await prisma.appUser.upsert({
    where: { name: IMPORTER },
    create: { name: IMPORTER, pinHash: "x".repeat(64), pinSalt: "y".repeat(32), role: "worker", active: true },
    update: { active: true },
  });
  TOKEN = `qa-${RUN}-token`;
  await prisma.authSession.create({ data: { userId: user.id, token: TOKEN, expiresAt: new Date(Date.now() + 3600_000) } });
  // A pre-existing fleet type so type validation has a known-good value.
  await prisma.vehicle.upsert({
    where: { vehicleNumber: v("SEED") },
    create: { vehicleNumber: v("SEED"), vehicleType: "PICK UP" },
    update: {},
  });
});

describe("FULL77 vehicle CSV import - parsing contract", () => {
  it("original structural shape: 3 blank preamble rows + padded header are skipped, not invalid; commit imports the data rows", async () => {
    const text = ",,,\r\n,,,\r\n,,,\r\nvehicle number ,COMPANY BODY,WITH EXTRA BODY,type \r\n" +
      `${v("0001")},,190,\r\n${v("0002")},,180,\r\n${v("0003")},145,180,\r\n`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.invalid).toBe(0);
    expect(preview.creates).toBe(3);
    expect(preview.rows.map((r) => r.line)).toEqual([5, 6, 7]); // source line numbers carried
    expect(preview.skippedRows.map((s) => s.line)).toEqual([1, 2, 3, 4]);
    const commit = await boundCommit(text);
    expect(commit.refused).toBeUndefined();
    expect(commit.committed).toBe(3);
    expect((await listVehicles(v("0001"))).length).toBe(1);
  });

  it("quote-aware parsing: quoted numerics parse, quoted commas survive, BOM is stripped", async () => {
    const text = "\uFEFFvehicle number,COMPANY BODY,WITH EXTRA BODY,type\r\n" +
      `"${v("0004")}","145","180","PICK UP"\r\n"${v("0005")}",10,20,"PICK, UP - HALF"\r\n`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.rows[0]).toMatchObject({ companyBodyQty: 145, extraBodyQty: 180, vehicleType: "PICK UP", status: "create" });
    // The quoted comma is preserved whole by the parser (never truncated);
    // the type then fails the character check honestly instead of corrupting columns.
    expect(preview.rows[1].vehicleType).toBe("PICK, UP - HALF");
    expect(preview.rows[1].status).toBe("invalid");
    expect(preview.rows[1].note).toMatch(/unsupported characters/);
  });

  it("a quoted empty quantity stays null - nothing is invented", async () => {
    const preview = await importVehiclesCsv(csv([`"${v("0006")}","",,""`]), "preview", undefined, TOKEN);
    expect(preview.rows[0]).toMatchObject({ companyBodyQty: null, extraBodyQty: null, vehicleType: null, status: "create" });
  });

  it("wrong column count is invalid and refuses the whole commit without writing", async () => {
    const before = await allTables();
    const text = csv([`${v("0007")},10,20,PICK UP,EXTRA COLUMN`, `${v("0008")},10,,`]);
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.invalid).toBe(1);
    const commit = await boundCommit(text);
    expect(commit.refused).toMatch(/invalid/);
    expect(commit.committed).toBe(0);
    expect(await allTables()).toEqual(before);
  });

  it("NaN, Infinity and negative quantities are invalid and refuse the whole commit", async () => {
    for (const q of ["NaN", "Infinity", "-1"]) {
      const before = await allTables();
      const commit = await boundCommit(csv([`${v("BAD")},${q},,`, `${v("OK")},20,,`]));
      expect(commit.refused).toMatch(/invalid/);
      expect(await allTables()).toEqual(before);
    }
  });

  it("header aliases and comment rows are skipped and reported", async () => {
    const text = "Vehicle list\nVehicle No,COMPANY BODY,WITH EXTRA BODY,type\n" + `${v("0009")},10,,\n`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.totalRows).toBe(1);
    expect(preview.skippedRows.length).toBe(2);
    expect(preview.rows[0].vehicleNumber).toBe(v("0009"));
  });
});

describe("FULL77 vehicle CSV import - canonical matching", () => {
  it("a compact no-space plate matches the spaced stored vehicle (db-same, no false create)", async () => {
    await prisma.vehicle.upsert({ where: { vehicleNumber: v("0010") }, create: { vehicleNumber: v("0010"), companyBodyQty: 50 }, update: {} });
    const compact = v("0010").replace(/\s+/g, "");
    const preview = await importVehiclesCsv(csv([`${compact},50,,`]), "preview", undefined, TOKEN);
    expect(preview.rows[0].status).toBe("db-same");
    const spaced = await importVehiclesCsv(csv([`${compact},99,,`]), "preview", undefined, TOKEN);
    expect(spaced.rows[0].status).toBe("db-conflict"); // same vehicle, different values - reported, never overwritten
  });

  it("PICKUP and PICK UP are the same type - an identical repeat, not a conflict", async () => {
    const preview = await importVehiclesCsv(csv([`${v("0011")},10,,PICKUP`, `${v("0011")},10,,PICK UP`]), "preview", undefined, TOKEN);
    expect(preview.conflicts).toBe(0);
    expect(preview.rows[1].status).toBe("duplicate-same");
  });

  it("an unknown vehicle type is an invalid row, not silently invented", async () => {
    const before = await allTables();
    const commit = await boundCommit(csv([`${v("0012")},10,,NOT A REAL TYPE`]));
    expect(commit.refused).toMatch(/invalid/);
    expect(commit.committed).toBe(0);
    expect(await allTables()).toEqual(before);
  });
});

describe("FULL77 vehicle CSV import - authorization and review", () => {
  it("an enrolled install with no session commits nothing", async () => {
    const before = await allTables();
    const commit = await importVehiclesCsv(csv([`${v("0013")},10,,`]), "commit", undefined, undefined, undefined);
    expect(commit.refused).toBeTruthy();
    expect(commit.committed).toBeUndefined();
    expect(await allTables()).toEqual(before);
  });

  it("a commit with a real session writes audit rows attributed to the actor, never 'system'", async () => {
    const a = await prisma.auditLog.count();
    const o = await prisma.syncOutboxEvent.count();
    const commit = await boundCommit(csv([`${v("0014")},10,,`, `${v("0015")},20,,`]));
    expect(commit.committed).toBe(2);
    expect(await prisma.auditLog.count()).toBe(a + 2);
    expect(await prisma.syncOutboxEvent.count()).toBe(o + 2);
    const rows = await prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 2 });
    for (const r of rows) {
      const payload = JSON.parse(r.payload as string);
      expect(payload.role).toBe(IMPORTER);
      expect(payload.role).not.toBe("system");
    }
  });

  it("a conflicting group with NO decision refuses the whole commit - nothing is silently imported or excluded", async () => {
    const before = await allTables();
    const text = csv([`${v("0016")},10,,`, `${v("0016")},20,,PICK UP`, `${v("0017")},30,,`]);
    const commit = await boundCommit(text);
    expect(commit.refused).toMatch(/review decision/);
    expect(commit.committed).toBe(0);
    expect(await allTables()).toEqual(before);
  });

  it("an explicit 'exclude' decision imports only the clean rows; an explicit line choice imports the chosen line", async () => {
    const k1 = key(v("0018"));
    const text = csv([`${v("0018")},75,,`, `${v("0018")},78,,PICK UP`, `${v("0019")},10,,`]);
    const excl = await boundCommit(text, { [k1]: "exclude" });
    expect(excl.committed).toBe(1);
    expect((await listVehicles(v("0018"))).length).toBe(0);
    expect((await listVehicles(v("0019"))).length).toBe(1);
    const k2 = key(v("0020"));
    const pick = await boundCommit(csv([`${v("0020")},75,,`, `${v("0020")},78,,PICK UP`]), { [k2]: 3 });
    expect(pick.committed).toBe(1);
    const row = (await listVehicles(v("0020")))[0] as any;
    expect({ qty: row.companyBodyQty, type: row.vehicleType }).toEqual({ qty: 78, type: "PICK UP" });
  });

  it("a decision naming a line outside the group does not count as review", async () => {
    const k = key(v("0021"));
    const before = await allTables();
    const commit = await boundCommit(csv([`${v("0021")},1,,`, `${v("0021")},2,,`]), { [k]: 99 });
    expect(commit.refused).toMatch(/review decision/);
    expect(await allTables()).toEqual(before);
  });
});

describe("FULL77 vehicle CSV import - integrity", () => {
  it("a failing audit trigger rolls the whole import back across all tables", async () => {
    await prisma.$executeRawUnsafe("CREATE TRIGGER qa77_imp_fault BEFORE INSERT ON audit_logs WHEN NEW.entity_name='Vehicle' BEGIN SELECT RAISE(ABORT,'import audit fault'); END");
    const before = await allTables();
    try {
      await expect(boundCommit(csv([`${v("0022")},10,,`, `${v("0023")},20,,`]))).rejects.toThrow();
      expect(await allTables()).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER qa77_imp_fault");
    }
  });

  it("DB drift between preview and commit is re-read: a new conflicting row is never overwritten", async () => {
    const text = csv([`${v("0024")},10,,`]);
    expect((await importVehiclesCsv(text, "preview", undefined, TOKEN)).creates).toBe(1);
    await prisma.vehicle.create({ data: { vehicleNumber: v("0024"), companyBodyQty: 99 } });
    const before = await allTables();
    const commit = await boundCommit(text);
    expect(commit.rows[0].status).toBe("db-conflict");
    expect(commit.committed).toBe(0);
    expect(await allTables()).toEqual(before);
  });

  it("an identical re-import skips every row as db-same", async () => {
    const text = csv([`${v("0025")},10,,`]);
    await boundCommit(text);
    const again = await boundCommit(text);
    expect(again.rows[0].status).toBe("db-same");
    expect(again.committed).toBe(0);
  });
});

describe("FULL79 vehicle CSV import - preview binding and parser fail-closed", () => {
  it("a direct commit with no preview is refused and writes nothing", async () => {
    const before = await allTables();
    const r = await importVehiclesCsv(csv([`${v("0030")},10,,`]), "commit", undefined, TOKEN);
    expect(r.refused).toMatch(/run Preview/);
    expect(r.committed).toBe(0);
    expect(await allTables()).toEqual(before);
  });

  it("a commit bound to a DIFFERENT file's preview is refused (stale line choices impossible)", async () => {
    const before = await allTables();
    const preview = await importVehiclesCsv(csv([`${v("0031")},10,,`]), "preview", undefined, TOKEN);
    const r = await importVehiclesCsv(csv([`${v("0032")},999,,`]), "commit", undefined, TOKEN, preview.previewToken);
    expect(r.refused).toMatch(/run Preview/);
    expect((await listVehicles(v("0032"))).length).toBe(0);
    expect(await allTables()).toEqual(before);
  });

  it("a reordered header maps columns by NAME - quantities never swap meaning", async () => {
    const text = "type,WITH EXTRA BODY,COMPANY BODY,vehicle number\n" + `PICK UP,180,145,${v("0033")}\n`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.rows[0]).toMatchObject({ vehicleNumber: v("0033"), companyBodyQty: 145, extraBodyQty: 180, vehicleType: "PICK UP" });
  });

  it("a header missing a column is a truthful file rejection, not a guess", async () => {
    const text = "vehicle number,COMPANY BODY,type\n" + `${v("0034")},145,PICK UP\n`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    expect(preview.fileError).toMatch(/missing the extra column/);
    const r = await importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken);
    expect(r.refused).toMatch(/Header problem/);
  });

  it("an unterminated quote is invalid, never silently accepted", async () => {
    const text = csv([`${v("0035")},10,,`]) + `"${v("0036")},20,,`;
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    const bad = preview.rows.find((r) => r.note === "unterminated quoted field");
    expect(bad).toBeTruthy();
    const r = await importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken);
    expect(r.refused).toMatch(/invalid/);
  });

  it("an invalid mode fails closed and writes nothing", async () => {
    const before = await allTables();
    const r = await importVehiclesCsv(csv([`${v("0037")},10,,`]), "COMMIT" as any, undefined, TOKEN);
    expect(r.refused).toMatch(/Unknown import mode/);
    expect(await allTables()).toEqual(before);
  });
});

describe("FULL79 preview binding - actor, single-use, expiry", () => {
  it("a preview belongs to its actor: a different login cannot commit it", async () => {
    const other = await prisma.appUser.upsert({ where: { name: `QA Other ${RUN}` }, create: { name: `QA Other ${RUN}`, pinHash: "x".repeat(64), pinSalt: "y".repeat(32), role: "worker", active: true }, update: {} });
    const otherToken = `qa-${RUN}-other`;
    await prisma.authSession.create({ data: { userId: other.id, token: otherToken, expiresAt: new Date(Date.now() + 3600_000) } });
    const text = csv([`${v("0040")},10,,`]);
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    const before = await allTables();
    const r = await importVehiclesCsv(text, "commit", undefined, otherToken, preview.previewToken);
    expect(r.refused).toMatch(/different login/);
    expect(await allTables()).toEqual(before);
    // The rightful actor can still use it.
    expect((await importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken)).committed).toBe(1);
  });

  it("a preview token is single-use: a second commit with it is refused", async () => {
    const text = csv([`${v("0041")},10,,`]);
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    const [first, second] = await Promise.all([
      importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken),
      importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken),
    ]);
    const committed = [first, second].filter((r) => r.committed === 1).length;
    const refused = [first, second].filter((r) => r.refused).length;
    expect(committed).toBe(1); // exactly one wins, never a double import
    expect(refused).toBe(1);
    expect((await listVehicles(v("0041"))).length).toBe(1);
  });

  it("an expired or unknown (post-restart) token is refused truthfully", async () => {
    const text = csv([`${v("0042")},10,,`]);
    const before = await allTables();
    const unknown = await importVehiclesCsv(text, "commit", undefined, TOKEN, "never-issued-token");
    expect(unknown.refused).toMatch(/run Preview/);
    const preview = await importVehiclesCsv(text, "preview", undefined, TOKEN);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 31 * 60 * 1000);
      const expired = await importVehiclesCsv(text, "commit", undefined, TOKEN, preview.previewToken);
      expect(expired.refused).toMatch(/run Preview|expire/);
    } finally {
      vi.useRealTimers();
    }
    expect(await allTables()).toEqual(before);
  });
});
