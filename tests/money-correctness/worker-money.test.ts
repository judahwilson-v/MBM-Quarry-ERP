import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { copyFileSync } from 'node:fs';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/prisma', () => ({ getDb: async () => state.db }));
vi.mock('@/lib/sync/auto-sync', () => ({ triggerAutoSync: vi.fn() }));
vi.mock('@/app/actions/auth', () => ({ verifyEditPassword: vi.fn(), requireActor: async () => null, isEnrollmentComplete: async () => false }));
import { saveEmployeeLedgerEntry, getEmployeeLedger } from '../../src/app/actions/employees';
import { fetchDayBookData } from '../../src/lib/daybook-actions';
let sequence = 0;
beforeEach(async () => {
  if (!process.env.MBM_TEST_ROOT) throw Error('Fresh isolated runner required');
  const file = `${process.env.MBM_TEST_ROOT}/money-${++sequence}.db`;
  copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`, file);
  state.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await state.db.employee.create({ data: { id: 'worker', name: 'Synthetic worker' } });
});
afterEach(async () => { vi.clearAllTimers(); vi.useRealTimers(); await state.db.$disconnect(); });
const save = (date: string, type: string, amount: number, cashPaid = 0) => saveEmployeeLedgerEntry({ employeeId: 'worker', date, type, amount, cashPaid });
it('ISS06: backdated salary yields chronological 500/1500/1300 without rewriting stored snapshots', async () => {
  await save('2026-11-09', 'SALARY', 1000);
  await save('2026-11-09', 'ADVANCE', 200);
  await save('2026-11-08', 'SALARY', 500);
  const before = await state.db.employeeLedger.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] });
  const rows = await getEmployeeLedger('worker');
  expect(rows.map((r: any) => r.balance)).toEqual([500, 1500, 1300]);
  expect((await state.db.employee.findUnique({ where: { id: 'worker' } })).balance).toBe(1300);
  expect(await state.db.employeeLedger.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] })).toEqual(before);
  expect((await getEmployeeLedger('worker')).map((r: any) => r.balance)).toEqual([500, 1500, 1300]);
});
it('ISS06: backdated payment/advance/deduction retain signed totals, including negative balance', async () => {
  await save('2026-11-10', 'SALARY', 100);
  await save('2026-11-08', 'PAYMENT', 250);
  await save('2026-11-09', 'DEDUCTION', 20);
  await save('2026-11-07', 'ADVANCE', 30);
  expect((await getEmployeeLedger('worker')).map((r: any) => r.balance)).toEqual([-30, -280, -300, -200]);
  expect((await state.db.employee.findUnique({ where: { id: 'worker' } })).balance).toBe(-200);
});
it('ISS06: preserve a nonzero pre-ledger residual; do not reset an existing employee balance', async () => {
  await state.db.employee.update({ where: { id: 'worker' }, data: { balance: 70 } });
  await save('2026-11-09', 'SALARY', 100);
  await save('2026-11-08', 'PAYMENT', 20);
  expect((await getEmployeeLedger('worker')).map((r: any) => r.balance)).toEqual([50, 150]);
});
it.each(['2026-11-09', '2027-01-01', '2028-02-29'])('ISS08: cash payment on %s appears on that Day Book, not an adjacent day', async (date) => {
  await save(date, 'ADVANCE', 200, 200);
  const expenses = await state.db.expense.findMany();
  const events = await state.db.financialEvent.findMany();
  const entries = await state.db.dayBookExpenseEntry.findMany();
  const books = await state.db.dayBook.findMany();
  expect(expenses).toHaveLength(1); expect(events).toHaveLength(1); expect(entries).toHaveLength(1); expect(books).toHaveLength(1);
  expect(books[0].businessDate.toISOString()).toBe(`${date}T00:00:00.000Z`);
  expect(books[0].expenseTotal).toBe(200); expect(books[0].closingCashBalance).toBe(-200);
  expect(entries[0].sourceEventId).toBe(events[0].eventId);
  expect(events[0].entityId).toBe(expenses[0].id);
  const view = await fetchDayBookData(date);
  expect(view.cashExp).toBe(200); expect(view.closingCash).toBe(-200);
  for (const direction of [-1, 1]) {
    const adjacent = new Date(`${date}T00:00:00Z`); adjacent.setUTCDate(adjacent.getUTCDate() + direction);
    expect((await fetchDayBookData(adjacent.toISOString().slice(0, 10))).cashExp).toBe(0);
  }
});
it('zero cashPaid creates no expense, event or Day Book while changing only worker liability', async () => {
  await save('2026-11-09', 'SALARY', 1000);
  expect((await getEmployeeLedger('worker'))[0].balance).toBe(1000);
  expect(await state.db.expense.count()).toBe(0); expect(await state.db.financialEvent.count()).toBe(0); expect(await state.db.dayBook.count()).toBe(0);
});
it.each(['2026-02-30', '2026-13-01', '', '2026-11-09T00:00:00Z'])('reject invalid date label %s before any worker/expense mutation', async (date) => {
  await expect(save(date, 'ADVANCE', 200, 200)).rejects.toThrow('Date is invalid');
  expect(await state.db.employeeLedger.count()).toBe(0);
  expect(await state.db.expense.count()).toBe(0);
  expect((await state.db.employee.findUnique({ where: { id: 'worker' } })).balance).toBe(0);
});
