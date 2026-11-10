// FULL78 bootstrap trim: fresh installs must NOT seed real directory data.
// The 4 directory default arrays (parties, vehicles, employees, suppliers)
// are intentionally empty; only the 7 generic material rows remain, pending
// the owner's keep/drop decision (flagged, not silently removed).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SRC = readFileSync(path.resolve(__dirname, "../../src/lib/bootstrap.ts"), "utf8");

describe("FULL78 bootstrap trim", () => {
  it("ships no real vehicle registrations, party names, employees or suppliers in source", () => {
    expect(SRC).not.toMatch(/KL\s?\d{2}/); // no registration-shaped strings at all
    for (const name of ["Vijayalakshmi", "Anugraha", "Prasad", "Fathima", "Bijay"]) {
      expect(SRC).not.toContain(name);
    }
  });
  it("the four directory default arrays are intentionally empty", () => {
    for (const arr of ["defaultParties", "defaultVehicles"]) {
      const m = SRC.match(new RegExp(`const ${arr}[^=]*= \\[([\\s\\S]*?)\\];`));
      expect(m, arr).toBeTruthy();
      const body = m![1].replace(/\/\/[^\n]*/g, "").trim();
      expect(body, `${arr} body`).toBe("");
    }
    for (const arr of ["defaultEmployees", "defaultSuppliers"]) {
      const m = SRC.match(new RegExp(`const ${arr}[^=]*= \\[([\\s\\S]*?)\\];`));
      expect(m, arr).toBeTruthy();
      expect(m![1].trim(), `${arr} body`).toBe("");
    }
  });
  it("the 7 generic materials are unchanged (pending the owner's keep/drop decision)", () => {
    const m = SRC.match(/const defaultMaterials = \[([\s\S]*?)\] as const;/);
    expect(m).toBeTruthy();
    const names = [...m![1].matchAll(/\["([^"]+)"/g)].map((x) => x[1]);
    expect(names).toEqual(["6 MM", "12 MM", "20 MM", "40 MM", "DUST", "MSAND", "GSB"]);
  });
});
