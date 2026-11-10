// FULL78 boot proof: initializeDatabase on a fresh fixture DB creates zero
// directory rows and exactly the 7 generic materials.
import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PrismaClient } from "@prisma/client";
import { initializeDatabase } from "@/lib/bootstrap";

const prisma = new PrismaClient();

describe("FULL78 fresh boot", () => {
  it("seeds 0 parties/vehicles/employees/suppliers and 7 generic materials (actual startup)", async () => {
    // The shared fixture DB may already hold synthetic ZZ-series rows from the
    // import suite, so assert what initializeDatabase itself ADDS.
    const before = { v: await prisma.vehicle.count(), p: await prisma.party.count(), m: await prisma.material.count() };
    await initializeDatabase(prisma as any);
    expect((await prisma.vehicle.count()) - before.v).toBe(0);
    expect((await prisma.party.count()) - before.p).toBe(0);
    expect(await prisma.material.count()).toBe(7); // idempotent: exactly the 7 generic materials
    // All four directory arrays are covered: parties, vehicles (above) and
    // employees/suppliers (raw tables, asserted on actual startup state).
    const emp = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS c FROM employees") as any[];
    const sup = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS c FROM suppliers") as any[];
    expect(Number(emp[0].c)).toBe(0);
    expect(Number(sup[0].c)).toBe(0);
    // No real registration ever appears, however the DB started.
    expect(await prisma.vehicle.count({ where: { vehicleNumber: { startsWith: "KL" } } })).toBe(0);
  });
});
