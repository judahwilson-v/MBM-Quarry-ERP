"use server";

import { getDb } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getInventoryStock() {
  const db = await getDb();
  return db.inventoryStock.findMany({
    orderBy: { materialName: 'asc' },
    include: {
      transactions: {
        orderBy: { date: 'desc' },
        take: 5
      }
    }
  });
}

export async function adjustInventoryStock(
  materialName: string,
  quantityChange: number,
  type: 'PRODUCTION_IN' | 'SALE_OUT' | 'MANUAL_ADJUST',
  description?: string,
  unit: string = 'TONS'
) {
  const db = await getDb();
  
  // Find or create the stock entry
  let stock = await db.inventoryStock.findUnique({
    where: { materialName }
  });

  if (!stock) {
    stock = await db.inventoryStock.create({
      data: {
        materialName,
        quantity: quantityChange,
        unit
      }
    });
  } else {
    stock = await db.inventoryStock.update({
      where: { id: stock.id },
      data: {
        quantity: { increment: quantityChange }
      }
    });
  }

  // Log the transaction
  await db.inventoryTransaction.create({
    data: {
      stockId: stock.id,
      type,
      quantityChange,
      description,
      date: new Date()
    }
  });

  revalidatePath('/inventory');
  return stock;
}

export async function txAdjustInventoryStock(
  tx: any,
  materialName: string,
  quantityChange: number,
  type: 'PRODUCTION_IN' | 'SALE_OUT' | 'MANUAL_ADJUST',
  referenceId?: string,
  description?: string,
  unit: string = 'TONS'
) {
  if (quantityChange === 0) return;
  
  let stock = await tx.inventoryStock.findUnique({
    where: { materialName }
  });

  if (!stock) {
    stock = await tx.inventoryStock.create({
      data: {
        materialName,
        quantity: quantityChange,
        unit
      }
    });
  } else {
    stock = await tx.inventoryStock.update({
      where: { id: stock.id },
      data: {
        quantity: { increment: quantityChange }
      }
    });
  }

  await tx.inventoryTransaction.create({
    data: {
      stockId: stock.id,
      type,
      quantityChange,
      referenceId,
      description,
      date: new Date()
    }
  });

  return stock;
}

export async function getInventoryTransactions(stockId?: string) {
  const db = await getDb();
  return db.inventoryTransaction.findMany({
    where: stockId ? { stockId } : undefined,
    orderBy: { date: 'desc' },
    include: {
      stock: true
    },
    take: 50
  });
}
