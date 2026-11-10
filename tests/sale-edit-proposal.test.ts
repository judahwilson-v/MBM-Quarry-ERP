// FULL64: boolean proposal choice must be explicit. Regression pin for the
// FULL62 defect QA confirmed in the actual UI: a boolean field left on
// "Choose..." staged FALSE silently and filed a real true -> false request.
import assert from "node:assert/strict";
import { parseProposedValue } from "@/lib/domain/sale-edit-proposal";

// Blank / unchosen boolean is invalid, never coerced.
assert.throws(() => parseProposedValue("gstEnabled", ""), /Choose Yes or No for GST enabled\./);
assert.throws(() => parseProposedValue("gstEnabled", "Choose..."), /Choose Yes or No/);
assert.throws(() => parseProposedValue("gstEnabled", "  "), /Choose Yes or No/);
assert.throws(() => parseProposedValue("gstEnabled", "yes"), /Choose Yes or No/);
// Explicit choices parse to real booleans.
assert.equal(parseProposedValue("gstEnabled", "true"), true);
assert.equal(parseProposedValue("gstEnabled", "false"), false);
// Number and date rules unchanged (FULL62 non-finite validation intact).
assert.equal(parseProposedValue("qty", ""), null);
assert.equal(parseProposedValue("qty", "12.5"), 12.5);
assert.throws(() => parseProposedValue("qty", "1e999"), /must be a finite number/);
assert.equal(parseProposedValue("saleDate", ""), null);
assert.equal(parseProposedValue("saleDate", "2026-11-10"), new Date("2026-11-10").toISOString());
assert.throws(() => parseProposedValue("saleDate", "not-a-date"), /Date is invalid/);
// Free-text fields pass through.
assert.equal(parseProposedValue("partyName", "Acme"), "Acme");
assert.equal(parseProposedValue("remarks", ""), "");
console.log("sale-edit-proposal: all assertions passed");
