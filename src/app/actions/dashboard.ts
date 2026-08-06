"use server";

import { getDb } from "@/lib/prisma";

export async function getDashboardTotals() {
  const db = await getDb();
  
  const parties = await db.party.findMany({
    select: {
      id: true,
      partyLedgers: {
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { balance: true }
      }
    }
  });

  let totalToReceive = 0;
  let totalToPay = 0;

  for (const party of parties) {
    if (party.partyLedgers.length > 0) {
      const balance = party.partyLedgers[0].balance;
      // Balance Positive = MBM is Owed (To Receive)
      // Balance Negative = MBM Owes (To Pay)
      if (balance > 0) {
        totalToReceive += balance;
      } else if (balance < 0) {
        totalToPay += Math.abs(balance);
      }
    }
  }

  return { totalToReceive, totalToPay };
}

export type FuelPurchaseInput = {
  id?: string;
  date: string;
  fuelType: string;
  pricePerLitre?: string | number | null;
  qtyLitre?: string | number | null;
  amount: string | number;
  paidAmount: string | number;
  isCan: boolean;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
};
