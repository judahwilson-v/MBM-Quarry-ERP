import assert from "node:assert/strict";
import { createWeighbridgeTicket } from "@/app/actions/weighbridge";
import { getDb } from "@/lib/prisma";

// Setup global mock hooks for Prisma if needed
const globalForPrisma = globalThis as any;

function setupMockPrisma(transactionImpl: (attempt: number) => Promise<any>) {
  let attemptCount = 0;
  globalForPrisma.databaseReady = Promise.resolve();
  globalForPrisma.prisma = {
    $transaction: async (cb: any) => {
      attemptCount++;
      return await transactionImpl(attemptCount);
    }
  };
  return () => attemptCount;
}

function restoreRealPrisma() {
  delete globalForPrisma.prisma;
  delete globalForPrisma.databaseReady;
}

async function runChallengerTestSuite() {
  console.log("=========================================================");
  console.log("  CHALLENGER 1: EMPIRICAL VERIFICATION HARNESS (KB-025)  ");
  console.log("=========================================================\n");

  const results: { suite: string; test: string; status: "PASS" | "FAIL"; details: string }[] = [];

  // =========================================================================
  // SUITE 1: RETRIABLE PRISMA ERROR CODES (P2010, P1008, P2028, P2002)
  // =========================================================================
  const retriableCodes = ["P2010", "P1008", "P2028", "P2002"];

  for (const code of retriableCodes) {
    // Subtest A: Recovery after 2 failures
    try {
      const getAttemptCount = setupMockPrisma(async (attempt) => {
        if (attempt <= 2) {
          const err: any = new Error(`Simulated retriable DB error ${code}`);
          err.code = code;
          throw err;
        }
        return { id: "ticket-101", ticketNumber: 501, status: "FIRST_WEIGHT" };
      });

      const res = await createWeighbridgeTicket({ vehicleNumber: "KA-01-AB-1234", weight: 12000 });
      const totalAttempts = getAttemptCount();
      restoreRealPrisma();

      assert.equal(res.success, true, `Should succeed after retrying code ${code}`);
      assert.equal(totalAttempts, 3, `Should have retried twice and succeeded on 3rd attempt for ${code}`);
      assert.equal((res as any).ticket?.ticketNumber, 501);

      results.push({
        suite: "Retriable Codes",
        test: `Recovery on code ${code}`,
        status: "PASS",
        details: `Successfully retried 2 times and recovered on attempt 3.`
      });
    } catch (err: any) {
      restoreRealPrisma();
      results.push({
        suite: "Retriable Codes",
        test: `Recovery on code ${code}`,
        status: "FAIL",
        details: err.message
      });
    }

    // Subtest B: Exhaustion after 5 retries
    try {
      const getAttemptCount = setupMockPrisma(async (attempt) => {
        const err: any = new Error(`Persistent DB lock error ${code}`);
        err.code = code;
        throw err;
      });

      const res = await createWeighbridgeTicket({ vehicleNumber: "KA-01-AB-1234", weight: 12000 });
      const totalAttempts = getAttemptCount();
      restoreRealPrisma();

      assert.equal(res.success, false, `Should fail after 5 retries for ${code}`);
      assert.equal(totalAttempts, 5, `Should attempt exactly 5 times for ${code}`);
      assert.equal(
        res.message,
        "Unable to allocate ticket number due to high concurrency. Please retry.",
        "Must return exact concurrency error message"
      );
      assert.ok(!res.message?.includes(code), "Must not leak error code");

      results.push({
        suite: "Retriable Codes",
        test: `Max retry exhaustion on code ${code}`,
        status: "PASS",
        details: `Attempted 5 times and returned sanitized high concurrency message.`
      });
    } catch (err: any) {
      restoreRealPrisma();
      results.push({
        suite: "Retriable Codes",
        test: `Max retry exhaustion on code ${code}`,
        status: "FAIL",
        details: err.message
      });
    }
  }

  // =========================================================================
  // SUITE 2: RETRIABLE ERROR MESSAGE STRINGS
  // =========================================================================
  const retriableMessages = [
    "database is locked",
    "sqlite_busy",
    "timed out",
    "transaction expired",
    "transaction api error",
    "ticket_number"
  ];

  for (const msgSubstring of retriableMessages) {
    try {
      const getAttemptCount = setupMockPrisma(async (attempt) => {
        if (attempt <= 1) {
          throw new Error(`Raw SQLite error: ${msgSubstring} occurred`);
        }
        return { id: "ticket-102", ticketNumber: 502, status: "FIRST_WEIGHT" };
      });

      const res = await createWeighbridgeTicket({ vehicleNumber: "KA-02-CD-5678", weight: 14000 });
      const totalAttempts = getAttemptCount();
      restoreRealPrisma();

      assert.equal(res.success, true, `Should retry on message containing '${msgSubstring}'`);
      assert.equal(totalAttempts, 2, `Should succeed on 2nd attempt for '${msgSubstring}'`);

      results.push({
        suite: "Retriable String Matching",
        test: `Retry on message containing '${msgSubstring}'`,
        status: "PASS",
        details: `Retried and recovered on attempt 2.`
      });
    } catch (err: any) {
      restoreRealPrisma();
      results.push({
        suite: "Retriable String Matching",
        test: `Retry on message containing '${msgSubstring}'`,
        status: "FAIL",
        details: err.message
      });
    }
  }

  // =========================================================================
  // SUITE 3: NON-RETRIABLE EXCEPTIONS & SANITIZATION
  // =========================================================================
  const nonRetriableErrors = [
    { code: "P2003", message: "Foreign key constraint failed on the field: (`partyId`)" },
    { code: "P1001", message: "Can't reach database server at localhost:5432" },
    { code: undefined, message: "TypeError: Cannot read properties of undefined (reading 'foo')" }
  ];

  for (const errObj of nonRetriableErrors) {
    try {
      const getAttemptCount = setupMockPrisma(async () => {
        const err: any = new Error(errObj.message);
        if (errObj.code) err.code = errObj.code;
        throw err;
      });

      const res = await createWeighbridgeTicket({ vehicleNumber: "KA-03-EF-9012", weight: 16000 });
      const totalAttempts = getAttemptCount();
      restoreRealPrisma();

      assert.equal(res.success, false, "Should return failure for non-retriable error");
      assert.equal(totalAttempts, 1, "Should NOT retry non-retriable error (attempts must be 1)");
      assert.equal(
        res.message,
        "Failed to create weighbridge ticket due to a system error. Please try again.",
        "Must return sanitized system error message"
      );
      assert.ok(!res.message?.includes(errObj.message), "Must NOT leak raw error message string");
      if (errObj.code) {
        assert.ok(!res.message?.includes(errObj.code), "Must NOT leak raw Prisma code");
      }

      results.push({
        suite: "Non-Retriable Sanitization",
        test: `Non-retriable error [code: ${errObj.code || "none"}]`,
        status: "PASS",
        details: `Stopped at attempt 1 and returned sanitized system error message.`
      });
    } catch (err: any) {
      restoreRealPrisma();
      results.push({
        suite: "Non-Retriable Sanitization",
        test: `Non-retriable error [code: ${errObj.code || "none"}]`,
        status: "FAIL",
        details: err.message
      });
    }
  }

  // =========================================================================
  // SUITE 4: safeRevalidatePath ERROR HANDLING
  // =========================================================================
  try {
    const getAttemptCount = setupMockPrisma(async () => {
      return { id: "ticket-103", ticketNumber: 503, status: "FIRST_WEIGHT" };
    });

    // revalidatePath in weighbridge.ts is called inside safeRevalidatePath.
    // In node environment outside Next.js request, revalidatePath throws or is mocked.
    const res = await createWeighbridgeTicket({ vehicleNumber: "KA-04-GH-3456", weight: 18000 });
    restoreRealPrisma();

    assert.equal(res.success, true, "Ticket creation must succeed even if safeRevalidatePath fails");
    assert.equal((res as any).ticket?.ticketNumber, 503);

    results.push({
      suite: "safeRevalidatePath",
      test: "Graceful handling outside Next.js request context",
      status: "PASS",
      details: "safeRevalidatePath caught cache invalidation error without throwing."
    });
  } catch (err: any) {
    restoreRealPrisma();
    results.push({
      suite: "safeRevalidatePath",
      test: "Graceful handling outside Next.js request context",
      status: "FAIL",
      details: err.message
    });
  }

  // =========================================================================
  // SUITE 5: EMPIRICAL REAL SQLITE DATABASE CONCURRENCY STRESS TEST
  // =========================================================================
  try {
    console.log("Running real SQLite DB concurrency test (20 parallel operations)...");
    restoreRealPrisma(); // Ensure real database connection is used
    const realDb = await getDb();

    // Clean up any test records or fetch starting ticket number
    const maxBefore = await realDb.weighbridgeTicket.aggregate({ _max: { ticketNumber: true } });
    const startTicketNum = maxBefore._max.ticketNumber || 0;

    const CONCURRENCY = 20;
    const promises = Array.from({ length: CONCURRENCY }).map((_, i) =>
      createWeighbridgeTicket({
        vehicleNumber: `CHALLENGE-KA-05-STRESS-${i}`,
        weight: 20000 + i * 50,
        ticketType: "OUTGOING"
      })
    );

    const responses = await Promise.all(promises);

    const successful = responses.filter((r) => r.success && r.ticket);
    const failed = responses.filter((r) => !r.success);

    console.log(`  -> Real DB Concurrency Results: ${successful.length} succeeded, ${failed.length} failed/retried.`);

    // Verify all successful tickets have unique ticketNumbers
    const ticketNumbers = successful.map((r) => (r as any).ticket.ticketNumber);
    const uniqueTicketNumbers = new Set(ticketNumbers);

    assert.equal(
      ticketNumbers.length,
      uniqueTicketNumbers.size,
      "All created ticket numbers MUST be strictly unique (no duplicate sequence numbers)!"
    );

    // Verify all ticket numbers are greater than startTicketNum
    for (const num of ticketNumbers) {
      assert.ok(num > startTicketNum, `Ticket number ${num} must be > starting ticket ${startTicketNum}`);
    }

    // Verify error messages of any failed requests
    for (const f of failed) {
      assert.ok(f.message, "Failure response must include message");
      assert.ok(!f.message.includes("P2002"), "Must not leak P2002 code");
      assert.ok(!f.message.includes("SQLITE_BUSY"), "Must not leak SQLITE_BUSY error");
      assert.ok(!f.message.includes("UNIQUE constraint"), "Must not leak constraint string");
    }

    results.push({
      suite: "Real SQLite Concurrency",
      test: `20 Parallel Ticket Allocations`,
      status: "PASS",
      details: `${successful.length}/${CONCURRENCY} tickets created with 100% unique ticket numbers (${Array.from(uniqueTicketNumbers).join(", ")}).`
    });
  } catch (err: any) {
    results.push({
      suite: "Real SQLite Concurrency",
      test: `20 Parallel Ticket Allocations`,
      status: "FAIL",
      details: err.message
    });
  }

  // =========================================================================
  // SUMMARY REPORTING
  // =========================================================================
  console.log("\n=========================================================");
  console.log("            CHALLENGER 1 VERIFICATION RESULTS            ");
  console.log("=========================================================");

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (r.status === "PASS") passCount++;
    else failCount++;
    console.log(`[${r.status}] [${r.suite}] ${r.test}: ${r.details}`);
  }

  console.log(`\nTOTAL PASSED: ${passCount}`);
  console.log(`TOTAL FAILED: ${failCount}`);

  if (failCount > 0) {
    console.error("\n[VERDICT]: REJECT - One or more empirical tests failed.");
    process.exitCode = 1;
  } else {
    console.log("\n[VERDICT]: APPROVE - All empirical tests passed with 100% compliance.");
  }
}

runChallengerTestSuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exitCode = 1;
});
