"use server";

import { getOrCreateDayBook, recalculateDayBook } from "@/lib/domain/daybook";
import { paymentCashBook } from "@/lib/domain/daybook/payment-summary";
import { getDb } from "./prisma";
import { writeAuditEvent } from "@/lib/domain";
import { triggerAutoSync } from "@/lib/sync/auto-sync";
import { businessDateKey, businessDayBounds, businessTimestampForWrite } from "@/lib/domain/daybook/business-date";
export async function fetchDayBookData(dateString?: string) {
 const db=await getDb();return db.$transaction(async(tx)=>{
  const key=businessDateKey(dateString),label=key.toISOString().slice(0,10);const {start,endExclusive}=businessDayBounds(label);
  const book=await tx.dayBook.findUnique({where:{businessDate:key}});const previous=new Date(key);previous.setUTCDate(previous.getUTCDate()-1);
  const prior=book?null:await tx.dayBook.findUnique({where:{businessDate:previous}});
  const openingCash=book?.openingCashBalance??prior?.closingCashBalance??0,openingBank=book?.openingBankBalance??prior?.closingBankBalance??0;
  const sales=await tx.outgoingSale.findMany({where:{saleDate:{gte:start,lt:endExclusive}}});
  const cashSales=sales.reduce((sum,r)=>sum+r.cashPaid,0),bankSales=sales.reduce((sum,r)=>sum+r.bankPaid+r.gPayPaid,0),creditSales=sales.reduce((sum,r)=>sum+r.remainingCredit,0);
  const result=await paymentCashBook(tx,label,openingCash,openingBank,book?.id,cashSales,bankSales);
  if(!result.available)throw new Error(result.unresolved.join("; "));
  const cashCollections=result.collections.reduce((sum,r)=>sum+r.cashPaid,0),bankCollections=result.collections.reduce((sum,r)=>sum+r.bankPaid+r.gPayPaid,0);
  const categories={dieselExp:0,labourExp:0,vehicleExp:0,otherExp:0};for(const e of result.entries){const type=e.expenseType.toLowerCase();if(type.includes('diesel'))categories.dieselExp+=e.amount;else if(type.includes('labour'))categories.labourExp+=e.amount;else if(type.includes('vehicle'))categories.vehicleExp+=e.amount;else categories.otherExp+=e.amount;}
  const cashToBank=result.transfers.filter(r=>r.type==='CASH_TO_BANK').reduce((sum,r)=>sum+r.amount,0),bankToCash=result.transfers.filter(r=>r.type==='BANK_TO_CASH').reduce((sum,r)=>sum+r.amount,0);
  return JSON.parse(JSON.stringify({openingCash,openingBank,cashSales,bankSales,creditSales,cashCollections,bankCollections,...categories,cashExp:result.expenseTotal,expenseTotal:result.expenseTotal,cashToBank,bankToCash,closingCash:result.closingCash,closingBank:result.closingBank,expenses:result.entries,transfers:result.transfers}));
 });
}

function matchesSavedTransfer(prior: { type: string; amount: number; time: string; remarks: string | null; userName: string; date: Date }, data: { type: string; amount: number; time: string; remarks: string; userName: string; date: string }) {
  return prior.type === data.type
    && prior.amount === Number(data.amount)
    && prior.time === data.time
    && prior.remarks === data.remarks
    && prior.userName === data.userName
    && prior.date.getTime() === businessTimestampForWrite(data.date).getTime();
}

const CHANGED_INTENT_MESSAGE = 'A transfer with different details was already saved with this reference. Check the day\'s history before trying again.';

export async function saveCashTransfer(data: { submissionId: string; type: string; amount: number; time: string; date: string; remarks: string; userName: string }) {
  // FULL68: the client-generated submission reference IS the transfer row id.
  // An ambiguous retry of the SAME transfer returns the original row instead of
  // writing a duplicate; the same reference with changed details is refused
  // honestly so the bookkeeper checks the history first (Judah's audit intent:
  // no duplicate money movements). Narrow port of the R7 guard pattern only -
  // no funds-cover, balance, paise or opening policy is added here.
  if (!data || typeof data.submissionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.submissionId)) {
    throw new Error('A valid transfer reference is required.');
  }
  const db = await getDb();
  const runAttempt = () => db.$transaction(async (tx) => {
    const prior = await tx.cashTransfer.findUnique({ where: { id: data.submissionId } });
    if (prior) {
      if (!matchesSavedTransfer(prior, data)) {
        throw new Error(CHANGED_INTENT_MESSAGE);
      }
      return { row: prior, created: false };
    }
    const created = await tx.cashTransfer.create({
      data: {
        id: data.submissionId,
        type: data.type,
        amount: Number(data.amount),
        time: data.time,
        date: businessTimestampForWrite(data.date),
        remarks: data.remarks,
        userName: data.userName,
      }
    });
    const book = await getOrCreateDayBook(tx, data.date);
    await recalculateDayBook(tx, book);
    // FULL69: the audit row is part of the SAME transaction as the transfer
    // and the Day Book recalculation. An audit fault aborts everything - a
    // transfer is never saved without its trail (record-every-change intent).
    await writeAuditEvent(tx, {
      entityName: "CashTransfer",
      entityId: created.id,
      action: "create",
      role: data.userName || "system",
      after: created,
    });
    return { row: created, created: true };
  });

  let row: Awaited<ReturnType<typeof runAttempt>>["row"];
  let created: boolean;
  try {
    ({ row, created } = await runAttempt());
  } catch (error) {
    // A concurrent identical attempt lost the unique race: the winner already
    // committed the same fact (row + Day Book + audit in ONE transaction).
    // Return the original row for identical content; a changed intent is
    // still refused honestly, and no ORM error text reaches the caller.
    if (error instanceof Error && error.message === CHANGED_INTENT_MESSAGE) throw error;
    // FULL71: raw ORM/driver text never crosses the server-action boundary.
    // The caller gets one honest retryable message; the original error is
    // preserved as the cause for server-side diagnostics.
    if ((error as { code?: string } | null)?.code !== "P2002") {
      throw new Error("Could not save the transfer right now; please retry.", { cause: error });
    }
    // FULL72: the re-read itself is inside the same sanitized boundary - a
    // storage fault here must not leak raw ORM/driver text either.
    let prior: Awaited<ReturnType<typeof db.cashTransfer.findUnique>>;
    try {
      prior = await db.cashTransfer.findUnique({ where: { id: data.submissionId } });
    } catch (rereadError) {
      throw new Error("Could not save the transfer right now; please retry.", { cause: rereadError });
    }
    if (!prior) {
      throw new Error("Could not save the transfer right now; please retry.", { cause: error });
    }
    if (!matchesSavedTransfer(prior, data)) {
      throw new Error(CHANGED_INTENT_MESSAGE);
    }
    row = prior;
    created = false;
  }

  // Fire-and-forget: don't block the server action response with sync. A retry
  // of an already-saved transfer re-triggers delivery of the same fact.
  setTimeout(() => triggerAutoSync().catch(console.error), 0);
  return row;
}

export async function logDayBookAudit(data: { userName: string; date: string; time: string; oldValue: any; newValue: any; action: string; module: string }) {
  const db = await getDb();
  await db.auditLog.create({
    data: {
      entityName: "DayBook",
      entityId: "manual_edit",
      action: "manual_edit",
      payload: JSON.stringify(data)
    }
  });
}

export async function purgeOldAuditLogs() {
  // auditLog also carries delivery intent, including unsent deletions.
  return {
    success: false as const,
    code: "RETENTION_POLICY_REQUIRED" as const,
    message: "Age-based local audit cleanup is paused. No records were deleted. Delivery and recovery requirements must be reviewed before cleanup.",
  };
}
