import assert from "node:assert/strict";
import {
  createWeighbridgeTicket,
  completeWeighbridgeTicket,
  getPendingTickets,
  voidWeighbridgeTicket
} from "@/app/actions/weighbridge";
import { getDb } from "@/lib/prisma";

async function runChallenger2Verification() {
  console.log("=================================================");
  console.log("  MILESTONE 2 ITERATION 3 VERIFICATION HARNESS  ");
  console.log("=================================================\n");

  const results: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];

  // Helper to assert error message is sanitized
  function assertSanitized(message: string | undefined, context: string) {
    assert.ok(message, `${context}: message must be defined`);
    assert.ok(!message.includes("prisma"), `${context}: message must not contain 'prisma'`);
    assert.ok(!message.includes("PrismaClient"), `${context}: message must not contain 'PrismaClient'`);
    assert.ok(!message.includes("Invalid `"), `${context}: message must not contain 'Invalid \`prisma...'`);
    assert.ok(!message.includes("P20"), `${context}: message must not contain Prisma error codes like P2025/P2002`);
    assert.ok(!message.includes("SQLITE_BUSY"), `${context}: message must not contain SQLITE_BUSY`);
    assert.ok(!message.includes("Record to update not found"), `${context}: message must not contain raw Prisma record text`);
  }

  // --- TEST 1: voidWeighbridgeTicket with Non-Existent Ticket ID ---
  try {
    console.log("Test 1: voidWeighbridgeTicket with non-existent ID...");
    const nonExistentId = "non-existent-ticket-id-99999";
    const res = await voidWeighbridgeTicket(nonExistentId, "Testing void non-existent ticket");
    console.log("  -> Result:", JSON.stringify(res));

    assert.equal(res.success, false, "Should fail for non-existent ticket");
    assert.equal(res.message, "Ticket not found.", "Should return clean domain message 'Ticket not found.'");
    assertSanitized(res.message, "Test 1 voidWeighbridgeTicket");

    results.push({
      test: "Test 1: voidWeighbridgeTicket Non-Existent ID",
      status: "PASS",
      details: `Returned clean sanitized message: "${res.message}"`
    });
  } catch (err: any) {
    results.push({
      test: "Test 1: voidWeighbridgeTicket Non-Existent ID",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 2: completeWeighbridgeTicket with Non-Existent Ticket ID ---
  try {
    console.log("\nTest 2: completeWeighbridgeTicket with non-existent ID...");
    const nonExistentId = "non-existent-ticket-id-88888";
    const res = await completeWeighbridgeTicket(nonExistentId, 25000);
    console.log("  -> Result:", JSON.stringify(res));

    assert.equal(res.success, false, "Should fail for non-existent ticket");
    assert.equal(res.message, "Ticket not found.", "Should return clean domain message 'Ticket not found.'");
    assertSanitized(res.message, "Test 2 completeWeighbridgeTicket");

    results.push({
      test: "Test 2: completeWeighbridgeTicket Non-Existent ID",
      status: "PASS",
      details: `Returned clean sanitized message: "${res.message}"`
    });
  } catch (err: any) {
    results.push({
      test: "Test 2: completeWeighbridgeTicket Non-Existent ID",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 3: getPendingTickets Execution & Clean Output ---
  try {
    console.log("\nTest 3: getPendingTickets execution...");
    const res = await getPendingTickets();
    console.log("  -> Result success:", res.success, "| ticket count:", res.tickets?.length);

    assert.equal(res.success, true, "getPendingTickets should succeed under normal operations");
    assert.ok(Array.isArray(res.tickets), "tickets must be an array");

    results.push({
      test: "Test 3: getPendingTickets Execution",
      status: "PASS",
      details: `Successfully retrieved ${res.tickets.length} pending tickets.`
    });
  } catch (err: any) {
    results.push({
      test: "Test 3: getPendingTickets Execution",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 4: Full Lifecycle (Create -> Void / Complete & Repeated Action Rejection) ---
  try {
    console.log("\nTest 4: Full Lifecycle (Create -> Void -> Attempt Void/Complete again)...");
    
    // Create a ticket
    const createRes = await createWeighbridgeTicket({
      vehicleNumber: "TEST-KA-04-XYZ-1234",
      weight: 12000,
      ticketType: "OUTGOING"
    });
    assert.equal(createRes.success, true, "Ticket creation should succeed");
    const ticketId = createRes.ticket!.id;

    // Void the ticket
    const voidRes = await voidWeighbridgeTicket(ticketId, "Test void lifecycle");
    assert.equal(voidRes.success, true, "Void ticket should succeed");

    // Attempt to void the ticket again
    const voidAgainRes = await voidWeighbridgeTicket(ticketId, "Attempting second void");
    console.log("  -> Void again result:", JSON.stringify(voidAgainRes));
    assert.equal(voidAgainRes.success, false, "Second void should fail");
    assert.equal(voidAgainRes.message, "Ticket is already completed or voided.");
    assertSanitized(voidAgainRes.message, "Test 4 void again");

    // Attempt to complete the voided ticket
    const completeVoidedRes = await completeWeighbridgeTicket(ticketId, 25000);
    console.log("  -> Complete voided result:", JSON.stringify(completeVoidedRes));
    assert.equal(completeVoidedRes.success, false, "Complete on voided ticket should fail");
    assert.equal(completeVoidedRes.message, "Ticket is already completed or voided.");
    assertSanitized(completeVoidedRes.message, "Test 4 complete voided");

    results.push({
      test: "Test 4: Ticket Status Transition Guarding",
      status: "PASS",
      details: "Correctly guarded status transitions and returned sanitized messages."
    });
  } catch (err: any) {
    results.push({
      test: "Test 4: Ticket Status Transition Guarding",
      status: "FAIL",
      details: err.message
    });
  }

  // --- TEST 5: Complete Ticket Lifecycle (Create -> Complete -> Attempt Void/Complete again) ---
  try {
    console.log("\nTest 5: Ticket Complete Lifecycle (Create -> Complete -> Attempt Void/Complete again)...");
    
    const createRes = await createWeighbridgeTicket({
      vehicleNumber: "TEST-KA-05-ABC-5678",
      weight: 10000,
      ticketType: "OUTGOING"
    });
    assert.equal(createRes.success, true, "Ticket creation should succeed");
    const ticketId = createRes.ticket!.id;

    // Complete ticket
    const completeRes = await completeWeighbridgeTicket(ticketId, 24000);
    assert.equal(completeRes.success, true, "Complete ticket should succeed");
    assert.equal(completeRes.ticket!.netWeight, 14000, "Net weight should be 24000 - 10000 = 14000");

    // Attempt to complete again
    const completeAgainRes = await completeWeighbridgeTicket(ticketId, 26000);
    console.log("  -> Complete again result:", JSON.stringify(completeAgainRes));
    assert.equal(completeAgainRes.success, false, "Second complete should fail");
    assert.equal(completeAgainRes.message, "Ticket is already completed or voided.");
    assertSanitized(completeAgainRes.message, "Test 5 complete again");

    // Attempt to void completed ticket
    const voidCompletedRes = await voidWeighbridgeTicket(ticketId, "Attempt void completed");
    console.log("  -> Void completed result:", JSON.stringify(voidCompletedRes));
    assert.equal(voidCompletedRes.success, false, "Void completed ticket should fail");
    assert.equal(voidCompletedRes.message, "Ticket is already completed or voided.");
    assertSanitized(voidCompletedRes.message, "Test 5 void completed");

    results.push({
      test: "Test 5: Completed Ticket State Lockout",
      status: "PASS",
      details: "Correctly calculated net weight and prevented re-completion / voiding."
    });
  } catch (err: any) {
    results.push({
      test: "Test 5: Completed Ticket State Lockout",
      status: "FAIL",
      details: err.message
    });
  }

  // --- SUMMARY ---
  console.log("\n=================================================");
  console.log("           VERIFICATION SUMMARY RESULTS           ");
  console.log("=================================================");
  let hasFailure = false;
  for (const r of results) {
    console.log(`[${r.status}] ${r.test} - ${r.details}`);
    if (r.status === "FAIL") hasFailure = true;
  }

  if (hasFailure) {
    process.exit(1);
  }
}

runChallenger2Verification().catch((err) => {
  console.error("FATAL HARNESS ERROR:", err);
  process.exit(1);
});
