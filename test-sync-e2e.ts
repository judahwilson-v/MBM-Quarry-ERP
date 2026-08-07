import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { performSync } from "./src/lib/sync/sync-service"; // Adjust path if needed
import { getDb } from "./src/lib/prisma";
import { saveSale } from "./src/app/actions/sales";

async function runTest() {
  console.log("Starting End-to-End Sync Test...");
  const db = await getDb();
  
  const material = await db.material.findFirst();
  if (!material) {
    console.error("No materials found in DB to use for test sale.");
    return;
  }
  
  // 1. Enter sale & save
  console.log("1. Creating test sale locally...");
  const testSaleData = {
    saleDate: new Date(),
    vehicleNumber: "TEST-SYNC-1234",
    partyName: "Sync Test Party",
    materialId: material.id,
    ratePerCft: 10,
    qty: 100,
    quantityReason: "Test",
    gstEnabled: false,
    discountType: "fixed",
    discountValue: 0,
    cashPaid: 0,
    bankPaid: 0,
    gPayPaid: 0,
    remarks: "E2E Sync Test Sale",
    bookNumber: 9999,
    pageNumber: 9999,
  };
  
  const saveResult = await saveSale(testSaleData);
  if (!saveResult.success) {
    console.error("Failed to save sale:", saveResult.error);
    return;
  }
  const localSaleId = (saveResult.data as any).id;
  console.log("Sale created locally with ID:", localSaleId);

  // 2. Click sync
  console.log("2. Running sync push to Supabase...");
  await performSync();
  console.log("Sync complete.");

  // 3. Check if it's there in Supabase
  console.log("3. Verifying sale exists in Supabase...");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: remoteSale, error: remoteError } = await supabase
    .from("outgoing_sales")
    .select("*")
    .eq("id", localSaleId)
    .single();
    
  if (remoteError || !remoteSale) {
    console.error("Failed to find sale in Supabase!", remoteError);
    return;
  }
  console.log("Sale found in Supabase! ID:", remoteSale.id, "Vehicle:", remoteSale.vehicle_number);

  // 4. Force reload the app (Simulate by wiping local DB record and sync state)
  console.log("4. Simulating app reload / fresh install...");
  console.log("Deleting local sale...");
  await db.outgoingSale.delete({ where: { id: localSaleId } });
  
  console.log("Wiping sync state to force a full pull...");
  await db.syncState.deleteMany({});
  
  // Verify it's gone locally
  const checkDeleted = await db.outgoingSale.findUnique({ where: { id: localSaleId } });
  if (checkDeleted) {
    console.error("Failed to delete local sale for testing.");
    return;
  }
  console.log("Local sale successfully deleted.");

  // 5. Click sync to retrieve data from Supabase
  console.log("5. Running sync pull from Supabase...");
  await performSync();
  console.log("Sync pull complete.");

  // 6. See that data in sale section
  console.log("6. Verifying data is restored in local DB...");
  const restoredSale = await db.outgoingSale.findUnique({ where: { id: localSaleId } });
  
  if (!restoredSale) {
    console.error("❌ TEST FAILED: Sale was not restored from Supabase!");
  } else {
    console.log("✅ TEST PASSED: Sale was successfully restored from Supabase!");
    console.log("Restored Vehicle Number:", restoredSale.vehicleNumber);
    console.log("Restored Party:", restoredSale.partyName);
  }
  
  // Cleanup
  console.log("Cleaning up test data from Supabase...");
  await supabase.from("outgoing_sales").delete().eq("id", localSaleId);
  console.log("Done.");
}

runTest().catch(console.error);
