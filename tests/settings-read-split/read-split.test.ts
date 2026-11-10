// Runtime behavior: secrets never cross to client-facing reads or mutation
// returns, while server-side verification keeps working. PIN fixture policy:
// all PINs are generated per run and never logged.
import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { getPublicSettings, updateGlobalSettings } from "@/app/actions/settings";
import { verifyAdminPin, verifyEditPassword, login } from "@/app/actions/auth";
import { saveUser } from "@/app/actions/users";
import { getSettingsWithSecrets } from "@/lib/settings/internal";
import { CONTROL_PRINCIPAL_KEY } from "@/lib/identity/service";

const prisma = new PrismaClient();
const genPin = () => crypto.randomInt(100000, 999999).toString();
const RUN = crypto.randomBytes(3).toString("hex");
const ADMIN_PIN = genPin();
const DELETE_PIN = genPin();
const USER_PIN = genPin();
const ADMIN = `SplitAdmin-${RUN}`;

async function seedPrivileged() {
  await saveUser({ name: ADMIN, pin: USER_PIN, role: "approver" });
  const user = await prisma.appUser.findUnique({ where: { name: ADMIN } });
  await prisma.appMeta.create({ data: { key: CONTROL_PRINCIPAL_KEY, value: user!.id } });
  await prisma.globalSettings.create({ data: { id: "default", adminPin: ADMIN_PIN, deletePin: DELETE_PIN } });
  return (await login(ADMIN, USER_PIN)).token!;
}

describe("settings read split", () => {
  it("public settings omit credential keys and values", async () => {
    await seedPrivileged();
    const pub = await getPublicSettings();
    expect(pub).not.toHaveProperty("adminPin");
    expect(pub).not.toHaveProperty("deletePin");
    const s = JSON.stringify(pub);
    expect(s).not.toContain(ADMIN_PIN);
    expect(s).not.toContain(DELETE_PIN);
    expect(pub.quarryName).toBeDefined();
  });
  it("the internal server reader still sees secrets (verification keeps working)", async () => {
    const raw = await getSettingsWithSecrets();
    expect(raw.adminPin).toBe(ADMIN_PIN);
    expect(await verifyEditPassword(ADMIN_PIN, "edit")).toBe(true);
    expect(await verifyEditPassword(DELETE_PIN, "delete")).toBe(true);
    expect(await verifyEditPassword(genPin(), "edit")).toBe(false);
  });
  it("verifyAdminPin verifies server-side without exposing the expected value", async () => {
    expect(await verifyAdminPin(ADMIN_PIN)).toBe(true);
    expect(await verifyAdminPin(genPin())).toBe(false);
  });
  it("updateGlobalSettings success response carries no credentials", async () => {
    const token = (await login(ADMIN, USER_PIN)).token!;
    const next = genPin();
    const r = await updateGlobalSettings({ adminPin: next, deletePin: DELETE_PIN, gstNumber: "GST" + RUN } as any, ADMIN_PIN, token);
    expect(r.success).toBe(true);
    const s = JSON.stringify(r);
    expect(s).not.toContain(next);
    expect(s).not.toContain(ADMIN_PIN);
    expect(s).not.toContain(DELETE_PIN);
    // and the new PIN actually took effect server-side
    expect(await verifyAdminPin(next)).toBe(true);
  });
});
