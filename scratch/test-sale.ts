import { getDb } from "./src/lib/prisma";
import { saveSale } from "./src/app/actions/sales";

async function main() {
  const db = await getDb();
  const mat = await db.material.findFirst();
  if(mat) {
      saveSale({
          saleDate: new Date().toISOString(),
          vehicleNumber: "TEST 123",
          partyName: "Test Party",
          materialId: mat.id,
          ratePerCft: 40,
          qty: 100,
          discountType: "fixed",
          discountValue: 0,
          cashPaid: 0,
          bankPaid: 0,
          gPayPaid: 0,
      }).then(res => console.log("Success"))
      .catch(e => console.error("Error calling saveSale:", e));
  } else {
      console.log("No material found");
  }
}
main();
