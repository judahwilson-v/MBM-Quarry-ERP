export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushSync, pullSync } from "@/lib/sync/sync-service";
import { getDb } from "@/lib/prisma";
import { saveSale } from "@/app/actions/sales";

export async function GET() {
  const logs: string[] = [];
  function log(msg: string) {
    logs.push(msg);
    console.log(msg);
  }
  
  try {
    log("Starting End-to-End Sync Test...");
    const db = await getDb();
    
    const material = await db.material.findFirst();
    if (!material) {
      log("No materials found in DB to use for test sale.");
      return NextResponse.json({ success: false, logs });
    }
    
    // 1. Enter sale & save
    log("1. Creating test sale locally...");
    const testSaleData = {
      saleDate: new Date().toISOString().split("T")[0],
      vehicleNumber: "TEST-SYNC-9999",
      partyName: "Sync Test Party",
      materialId: material.id,
      ratePerCft: 10,
      qty: 100,
      quantityReason: "Test",
      gstEnabled: false,
      discountType: "fixed" as const,
      discountValue: 0,
      cashPaid: 0,
      bankPaid: 0,
      gPayPaid: 0,
      remarks: "E2E Sync Test Sale",
      bookNumber: "9999",
      pageNumber: "9999",
    };
    
    const saveResult = await saveSale(testSaleData);
    if (!saveResult.success) {
      log(`Failed to save sale: ${saveResult.error}`);
      return NextResponse.json({ success: false, logs });
    }
    const localSaleId = (saveResult.data as any).id;
    log(`Sale created locally with ID: ${localSaleId}`);

    // 2. Click sync
    log("2. Running sync push to Supabase...");
    await pushSync();
    log("Sync complete.");

    // 3. Check if it's there in Supabase
    log("3. Verifying sale exists in Supabase...");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: remoteSale, error: remoteError } = await supabase
      .from("outgoing_sales")
      .select("*")
      .eq("id", localSaleId)
      .single();
      
    if (remoteError || !remoteSale) {
      log(`Failed to find sale in Supabase! ${remoteError?.message}`);
      return NextResponse.json({ success: false, logs });
    }
    log(`Sale found in Supabase! ID: ${remoteSale.id}, Vehicle: ${remoteSale.vehicle_number}`);

    // 4. Force reload the app (Simulate by wiping local DB record and sync state)
    log("4. Simulating app reload / fresh install...");
    log("Deleting local sale...");
    await db.outgoingSale.delete({ where: { id: localSaleId } });
    
    log("Wiping sync state to force a full pull...");
    await db.syncState.deleteMany({});
    
    // Verify it's gone locally
    const checkDeleted = await db.outgoingSale.findUnique({ where: { id: localSaleId } });
    if (checkDeleted) {
      log("Failed to delete local sale for testing.");
      return NextResponse.json({ success: false, logs });
    }
    log("Local sale successfully deleted.");

    // 5. Click sync to retrieve data from Supabase
    log("5. Running sync pull from Supabase...");
    await pullSync();
    log("Sync pull complete.");

    // 6. See that data in sale section
    log("6. Verifying data is restored in local DB...");
    const restoredSale = await db.outgoingSale.findUnique({ where: { id: localSaleId } });
    
    if (!restoredSale) {
      log("❌ TEST FAILED: Sale was not restored from Supabase!");
      return NextResponse.json({ success: false, logs });
    } else {
      log("✅ TEST PASSED: Sale was successfully restored from Supabase!");
      log(`Restored Vehicle Number: ${restoredSale.vehicleNumber}`);
      log(`Restored Party: ${restoredSale.partyName}`);
    }
    
    // Cleanup
    log("Cleaning up test data from Supabase...");
    await supabase.from("outgoing_sales").delete().eq("id", localSaleId);
    
    log("Cleaning up local DB again...");
    await db.outgoingSale.delete({ where: { id: localSaleId } });
    
    log("Done.");
    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    log(`Exception occurred: ${error.message}`);
    return NextResponse.json({ success: false, logs, error: error.message });
  }
}
