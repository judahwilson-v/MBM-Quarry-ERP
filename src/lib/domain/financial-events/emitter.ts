import type { Prisma } from "@prisma/client";
import { createFinancialEvent } from "./service";
import type { FinancialEventInput } from "./types";

export async function emitFinancialEvent(tx: Prisma.TransactionClient, input: FinancialEventInput) {
  return createFinancialEvent(tx, input);
}
