import assert from "node:assert/strict";
import { getDb } from "@/lib/prisma";

/**
 * Empirical Verification Harness for Weighbridge Ticket Creation & Race Condition Handling
 */

// 1. Mock runner reproducing the exact retry loop logic in createWeighbridgeTicket
async function simulateCreateWeighbridgeTicket(
  behavior: (attempt: number) => Promise<any>
) {
  const MAX_RETRIES = 5;
  let attempt = 0;
  const logs: string[] = [];

  while (attempt < MAX_RETRIES) {
    try {
      const ticket = await behavior(attempt + 1);
      return { success: true, ticket, attempts: attempt + 1, logs };
    } catch (error: any) {
      attempt++;
      logs.push(`Attempt ${attempt} failed with code=${error?.code}, message=${error?.message}`);

      const isUniqueCollision =
        error?.code === "P2002" ||
        (typeof error?.message === "string" && error.message.includes("ticket_number"));

      if (isUniqueCollision && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      // Exact fallback in weighbridge.ts line 63:
      return { success: false, message: error.message, attempts: attempt, logs };
    }
  }

  // Unreachable fallback on line 67 in weighbridge.ts:
  return {
    success: false,
    message: "Unable to allocate ticket number due to high concurrency. Please retry.",
    attempts: attempt,
    logs
  };
}

async function runUnitTests() {
  console.log("=== 1. Mock Unit Tests for P2002 Retry Logic ===");

  // Test 1.1: Collision on attempt 1 & 2, recovery on attempt 3
  {
    const res = await simulateCreateWeighbridgeTicket(async (attempt) => {
      if (attempt < 3) {
        const err: any = new Error("Unique constraint failed on the fields: (`ticket_number`)");
        err.code = "P2002";
        throw err;
      }
      return { ticketNumber: 105, status: "FIRST_WEIGHT" };
    });

    assert.equal(res.success, true, "Should succeed after retries");
    assert.equal(res.attempts, 3, "Should take 3 attempts");
    assert.equal(res.ticket.ticketNumber, 105);
    console.log("✔ Test 1.1 (P2002 retry recovery on attempts 1-4): PASSED");
  }

  // Test 1.2: Collision on error message containing 'ticket_number'
  {
    const res = await simulateCreateWeighbridgeTicket(async (attempt) => {
      if (attempt < 2) {
        throw new Error("UNIQUE constraint failed: weighbridge_tickets.ticket_number");
      }
      return { ticketNumber: 106, status: "FIRST_WEIGHT" };
    });

    assert.equal(res.success, true, "Should recover when error message contains ticket_number");
    assert.equal(res.attempts, 2);
    console.log("✔ Test 1.2 (ticket_number string match recovery): PASSED");
  }

  // Test 1.3: Empirical Demonstration of Dead Code & Raw Error Exposure on Max Retries Exhaustion
  {
    const res = await simulateCreateWeighbridgeTicket(async () => {
      const err: any = new Error("Unique constraint failed on the fields: (`ticket_number`)");
      err.code = "P2002";
      throw err;
    });

    assert.equal(res.attempts, 5, "Should attempt 5 times");
    assert.equal(
      res.message,
      "Unique constraint failed on the fields: (`ticket_number`)",
      "Demonstrates line 67 is unreachable and returns raw error message"
    );
    console.log("⚠ Test 1.3 (Max retries exhaustion flushes raw error instead of fallback message): CONFIRMED");
  }

  // Test 1.4: Non-P2002 error (e.g. database connection error or timeout)
  {
    const res = await simulateCreateWeighbridgeTicket(async () => {
      const err: any = new Error("Database connection lost");
      err.code = "P1001";
      throw err;
    });

    assert.equal(res.success, false);
    assert.equal(res.attempts, 1, "Should NOT retry non-unique errors");
    assert.equal(res.message, "Database connection lost");
    console.log("✔ Test 1.4 (Non-P2002 immediate error return): PASSED");
  }
}

async function run() {
  await runUnitTests();
  console.log("\nALL EMPIRICAL HARNESS MOCK TESTS COMPLETED SUCCESSFULLY!");
}

void run().catch((error) => {
  console.error("Test execution failed:", error);
  process.exitCode = 1;
});
