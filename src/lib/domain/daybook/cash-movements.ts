// Shared movement arithmetic. Integration is under local review.
// Amount precision is retained; currency rounding policy is not selected here.
export type Movement = { source: string; id: string; cashDelta: number; bankDelta: number };
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw Error(`${label} must be finite`); return value; }
function paid(value: number, label: string) { finite(value, label); if (value < 0) throw Error(`${label} cannot be negative`); return value; }
export function explicitExpense(source: string, id: string, amount: number, mode: string): Movement {
  paid(amount, 'Expense payment');
  if (!['CASH','BANK','GPAY','CREDIT'].includes(mode)) throw Error('Expense payment mode is unresolved');
  return { source, id, cashDelta: mode === 'CASH' ? (-amount || 0) : 0, bankDelta: mode === 'BANK' || mode === 'GPAY' ? (-amount || 0) : 0 };
}
export function splitPayment(source: string, id: string, direction: 'RECEIVED' | 'PAID', cash: number, bank: number, gpay: number): Movement {
  if (direction !== 'RECEIVED' && direction !== 'PAID') throw Error('Payment direction is unresolved');
  [cash,bank,gpay].forEach(value => paid(value, 'Payment split'));
  const sign = direction === 'RECEIVED' ? 1 : -1;
  return {source,id,cashDelta:sign*cash || 0,bankDelta:sign*(bank+gpay) || 0};
}
export function transfer(source: string, id: string, direction: 'CASH_TO_BANK' | 'BANK_TO_CASH', amount: number): Movement {
  if (direction !== 'CASH_TO_BANK' && direction !== 'BANK_TO_CASH') throw Error('Transfer direction is unresolved');
  paid(amount, 'Transfer');const sign = direction === 'CASH_TO_BANK' ? -1 : 1;
  return {source,id,cashDelta:sign*amount || 0,bankDelta:-sign*amount || 0};
}
export function closeBook(openingCash: number, openingBank: number, movements: readonly Movement[]) {
  let cash = finite(openingCash, 'Opening cash'), bank = finite(openingBank, 'Opening bank');const seen = new Set<string>();
  for (const movement of movements) {
    if (!movement.source.trim() || !movement.id.trim()) throw Error('Movement source and identity are required');
    const key = JSON.stringify([movement.source,movement.id]);
    if (seen.has(key)) throw Error('Duplicate movement requires source reconciliation');
    seen.add(key);cash += finite(movement.cashDelta, 'Cash movement');bank += finite(movement.bankDelta, 'Bank movement');
  }
  return {closingCash:finite(cash,'Closing cash'),closingBank:finite(bank,'Closing bank')};
}
