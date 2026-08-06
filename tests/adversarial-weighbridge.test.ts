import assert from "node:assert/strict";
import {
  createWeighbridgeTicket,
  completeWeighbridgeTicket,
  getPendingTickets,
  voidWeighbridgeTicket
} from "@/app/actions/weighbridge";
import { getDb } from "@/lib/prisma";

async function runAdversarialVerification() {
  console.log("=================================================");
  console.log("  KB-025 ADVERSARIAL VERIFICATION HARNESS  ");
  console.log("=================================================\n");

  const results: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];

  // --- TEST 1: Concurrency & Retry Loop Termination in createWeighbridgeTicket ---
  try {
    console.log("Test 1: Testing concurrent ticket creation with 10 parallel requests...");
    const promises = Array.from({ length: 10 }).map((_, i) =>
      createWeighbridgeTicket({
        vehicleNumber: `TEST-KA-01-EA-${1000 + i}`,
        weight: 15000 + i * 100,
        ticketType: "OUTGOING"
      })
    );

    const resArray = await Promise.all(promises);
    const successCount = resArray.filter((r) => r.success).length;
    const failureCount = resArray.filter((r) => !r.success).length;

    console.log(`  -> Successes: ${successCount}, Failures: ${failureCount}`);

    // Verify all ticket numbers assigned were unique
    const createdTickets = resArray.filter((r) => r.success && r.ticket).map((r) => r.ticket!.ticketNumber);
    const uniqueTickets = new Set(createdTickets);

    assert.equal(createdTickets.length, uniqueTickets.size, "All created tickets MUST have unique ticket numbers!");
    console.log(`  -> Created ${uniqueTickets.size} unique tickets without sequence collision.`);

    // Verify error messages for any failed attempts do NOT leak raw DB errors
    for (const res of resArray) {
      if (!res.success) {
        assert.ok(res.message, "Failure result must have a message");
        assert.ok(!res.message.includes("P2002"), "Must not leak P2002 error code");
        assert.ok(!res.message.includes("SQLITE_BUSY"), "Must not leak SQLITE_BUSY");
        assert.ok(!res.message.includes("Unique constraint"), "Must not leak constraint strings");
      }
    }

    results.push({
      test: "Test 1: Concurrency & Unique Sequence Generation",
      status: "PASS",
      details: `Generated ${uniqueTickets.size} unique tickets cleanly across 10 concurrent requests.`
    });
  } catch (err: any) {
    results.push({
      test: "Test 1: Concurrency & Unique Sequence Generation",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 2: voidWeighbridgeTicket with non-existent ID (Raw Error Exposure Check) ---
  try {
    console.log("\nTest 2: Testing voidWeighbridgeTicket error message exposure on non-existent record...");
    const nonExistentId = "invalid-uuid-999999999";
    const res = await voidWeighbridgeTicket(nonExistentId, "Testing void non-existent");

    console.log("  -> voidWeighbridgeTicket result:", res);

    assert.equal(res.success, false, "Should fail when voiding non-existent ticket");

    // Check if raw Prisma error was returned
    const isRawPrismaError =
      res.message?.includes("Record to update not found") ||
      res.message?.includes("P2025") ||
      res.message?.includes("prisma") ||
      res.message?.includes("PrismaClient");

    if (isRawPrismaError) {
      console.log("  [!] RAW PRISMA ERROR LEAK DETECTED in voidWeighbridgeTicket:", res.message);
      results.push({
        test: "Test 2: voidWeighbridgeTicket Error Sanitization",
        status: "FAIL",
        details: `Raw Prisma error message leaked to client caller: "${res.message}"`
      });
    } else {
      results.push({
        test: "Test 2: voidWeighbridgeTicket Error Sanitization",
        status: "PASS",
        details: "Error message was properly sanitized."
      });
    }
  } catch (err: any) {
    results.push({
      test: "Test 2: voidWeighbridgeTicket Error Sanitization",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 3: completeWeighbridgeTicket lifecycle & error behavior ---
  try {
    console.log("\nTest 3: Testing completeWeighbridgeTicket lifecycle and non-existent ticket...");
    const nonExistentRes = await completeWeighbridgeTicket("non-existent-id-888888", 25000);
    console.log("  -> Non-existent ticket complete result:", nonExistentRes);

    assert.equal(nonExistentRes.success, false, "Should return success: false for non-existent ticket");
    assert.equal(nonExistentRes.message, "Ticket not found.", "Domain error for non-existent ticket in complete");

    results.push({
      test: "Test 3: completeWeighbridgeTicket Non-existent Handling",
      status: "PASS",
      details: "Correctly returned 'Ticket not found.'"
    });
  } catch (err: any) {
    results.push({
      test: "Test 3: completeWeighbridgeTicket Non-existent Handling",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 4: Verification of retriable error classification & max retries limit ---
  try {
    console.log("\nTest 4: Verifying createWeighbridgeTicket error sanitization under non-retriable failure...");
    // Pass invalid data if possible or test isRetriable behavior
    // We can test passing invalid partyId that causes FK failure if FKs are enabled or simulated
    const res = await createWeighbridgeTicket({
      vehicleNumber: "", // Empty string vehicle number or extreme invalid
      weight: -999999
    });

    console.log("  -> Invalid ticket creation result:", res);
    if (!res.success) {
      assert.ok(!res.message?.includes("P200"), "No raw Prisma code in error message");
      assert.ok(!res.message?.includes("prisma"), "No prisma keyword in error message");
    }

    results.push({
      test: "Test 4: createWeighbridgeTicket Sanitization",
      status: "PASS",
      details: `Returned sanitized message: "${res.message}"`
    });
  } catch (err: any) {
    results.push({
      test: "Test 4: createWeighbridgeTicket Sanitization",
      status: "FAIL",
      details: err.message
    });
  }

  console.log("\n=================================================");
  console.log("           VERIFICATION SUMMARY RESULTS           ");
  console.log("=================================================");
  for (const r of results) {
    console.log(`[${r.status}] ${r.test} - ${r.details}`);
  }
}

runAdversarialVerification().catch((err) => {
  console.error("FATAL HARNESS ERROR:", err);
  process.exitCode = 1;
});
