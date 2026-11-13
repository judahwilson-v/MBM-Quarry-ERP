import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { copyFileSync } from 'node:fs';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/prisma', () => ({ getDb: async () => state.db }));
vi.mock('@/lib/sync/auto-sync', () => ({ triggerAutoSync: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { saveSale, deleteSale } from '../../src/app/actions/sales';
import { adjustInventoryStock, txAdjustInventoryStock } from '../../src/lib/domain/inventory/service';
let sequence = 0;
beforeEach(async () => {
  if (!process.env.MBM_TEST_ROOT) throw Error('Fresh isolated fixture required');
  const file = `${process.env.MBM_TEST_ROOT}/stock-unit-${++sequence}.db`;
  copyFileSync(`${process.env.MBM_TEST_ROOT}/fixture.db`, file);
  state.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await state.db.globalSettings.create({ data: { id: 'default', deletePin: '424242', adminPin: '313131' } });
  await state.db.material.create({ data: { id: 'material', materialName: 'SYNTHETIC CFT', ratePerCft: 20 } });
});
afterEach(async () => { vi.clearAllTimers(); vi.useRealTimers(); await state.db.$disconnect(); });
const input = { saleDate: '2026-11-13', vehicleNumber: 'SYNTH 1311', partyName: 'Synthetic buyer', materialId: 'material', qty: 10, ratePerCft: 20, discountType: 'percentage' as const, discountValue: 0, cashPaid: 100, bankPaid: 0, gPayPaid: 0, bookNumber: '31', pageNumber: '1' };
const stock = () => state.db.inventoryStock.findUnique({ where: { materialName: 'SYNTHETIC CFT' } });
async function snapshot() {
  const names = ['inventoryStock', 'inventoryTransaction', 'outgoingSale', 'party', 'vehicle', 'financialEvent', 'auditLog', 'partyLedger', 'dayBook'];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await state.db[name].findMany({ orderBy: { id: 'asc' } })])));
}
it('sale create uses CFT, quantity edit deducts only difference, deletion restores CFT', async () => {
  const created = await saveSale(input); expect(created.success).toBe(true);
  expect(await stock()).toMatchObject({ quantity: -10, unit: 'CFT' });
  const edited = await saveSale({ ...input, id: created.data!.id, qty: 12, quantityReason: 'Synthetic measured correction' }, '313131');
  expect(edited.success).toBe(true); expect(await stock()).toMatchObject({ quantity: -12, unit: 'CFT' });
  const deleted = await deleteSale(created.data!.id, '424242'); expect(deleted.success).toBe(true);
  expect(await stock()).toMatchObject({ quantity: 0, unit: 'CFT' });
});
it('sale into a preexisting TONS row fails and rolls back all sale/master/financial/stock effects', async () => {
  await state.db.inventoryStock.create({ data: { materialName: 'SYNTHETIC CFT', quantity: 50, unit: 'TONS' } });
  const before = await snapshot();
  const result = await saveSale(input); expect(result.success).toBe(false);
  expect(await snapshot()).toEqual(before);
});
it('edit material restores old CFT and deducts new CFT; mismatch rolls the whole edit back', async () => {
  await state.db.material.create({ data: { id: 'second', materialName: 'SYNTHETIC SECOND', ratePerCft: 20 } });
  const created = await saveSale(input); expect(created.success).toBe(true);
  await state.db.inventoryStock.create({ data: { materialName: 'SYNTHETIC SECOND', quantity: 100, unit: 'TONS' } });
  const before = await snapshot();
  const mismatch = await saveSale({ ...input, id: created.data!.id, materialId: 'second' }, '313131');
  expect(mismatch.success).toBe(false); expect(await snapshot()).toEqual(before);
  // Only a synthetic test fixture is reset here. Production historical stock is never relabelled.
  await state.db.inventoryStock.delete({ where: { materialName: 'SYNTHETIC SECOND' } });
  const edited = await saveSale({ ...input, id: created.data!.id, materialId: 'second' }, '313131');
  expect(edited.success).toBe(true); expect(await stock()).toMatchObject({ quantity: 0, unit: 'CFT' });
  expect(await state.db.inventoryStock.findUnique({ where: { materialName: 'SYNTHETIC SECOND' } })).toMatchObject({ quantity: -10, unit: 'CFT' });
});
it('manual mismatched unit leaves balance and history untouched; matching CFT preserves unit', async () => {
  await adjustInventoryStock('SYNTHETIC CFT', 50, 'MANUAL_ADJUST', 'Synthetic stock', 'CFT');
  const before = await snapshot();
  await expect(adjustInventoryStock('SYNTHETIC CFT', 2, 'MANUAL_ADJUST', 'Mismatch', 'TONS')).rejects.toThrow('Inventory unit mismatch');
  expect(await snapshot()).toEqual(before);
  await adjustInventoryStock('SYNTHETIC CFT', -5, 'SALE_OUT', 'Synthetic adjustment', 'CFT');
  expect(await stock()).toMatchObject({ quantity: 45, unit: 'CFT' });
});
it('transactional mismatch rejects without inventory/history writes', async () => {
  await adjustInventoryStock('SYNTHETIC CFT', 50, 'MANUAL_ADJUST', 'Synthetic stock', 'CFT');
  const before = await snapshot();
  await expect(state.db.$transaction((tx: any) => txAdjustInventoryStock(tx, 'SYNTHETIC CFT', 10, 'PRODUCTION_IN', undefined, 'Mismatch', 'TONS'))).rejects.toThrow('Inventory unit mismatch');
  expect(await snapshot()).toEqual(before);
});
