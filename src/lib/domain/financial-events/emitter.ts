import type { Prisma } from "@prisma/client";
import { createFinancialEvent } from "./service";
import type { FinancialEventInput } from "./types";
import { projectLedgerFromFinancialEvent } from "../ledger";
import { getOrCreateDayBook, recalculateDayBook } from "../daybook";

export async function emitFinancialEvent(tx: Prisma.TransactionClient, input: FinancialEventInput) {
  const event = await createFinancialEvent(tx, input);
  
  // Project Ledger instantly
  const ledgerEntry = await projectLedgerFromFinancialEvent(tx, event);
  
  // Recalculate daybook if ledger entry created and has valid date
  if (ledgerEntry && ledgerEntry.entryDate) {
    const dayBook = await getOrCreateDayBook(tx, ledgerEntry.entryDate.toISOString());
    await recalculateDayBook(tx, dayBook);
  }
  
  return event;
}
