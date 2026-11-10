import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
// Auth is intentionally NOT mocked: real verifyEditPassword with seeded PINs.
import {saveFuelPurchase} from '../../src/app/actions/fuel';
import {dateInputValue} from '../../src/lib/date-label';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/fueldate-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

// Regression for the QA-proven defect: a fuel purchase saved on Nov 9 was prefilled
// as Nov 8 in the editor (UTC ISO split), so an authorized amount-only edit moved the
// fuel row, its mirrored expense and the Day Book projection to the wrong day.
it('fuel edit prefill keeps the business date label; amount-only edit stays on the same day',async()=>{
 const fuel=await saveFuelPurchase({date:'2026-11-09',fuelType:'DIESEL',amount:200,paidAmount:200,isCan:true});
 const row=await state.db.fuelPurchase.findFirst();
 const serialized=row.date.toISOString(); // exactly what the page receives after serialize()
 const prefill=dateInputValue(serialized);
 expect(prefill).toBe('2026-11-09'); // business label, not the UTC calendar date
 await saveFuelPurchase({id:fuel.id,date:prefill,fuelType:'DIESEL',amount:210,paidAmount:210,isCan:true},'313131');
 const after=await state.db.fuelPurchase.findFirst();
 expect(dateInputValue(after.date)).toBe('2026-11-09'); // identity retained, day unchanged
 const mirror=await state.db.expense.findFirst();
 expect(mirror.amount).toBe(210);
 expect(dateInputValue(mirror.expenseDate)).toBe('2026-11-09');
 const nov9=await state.db.dayBook.findUnique({where:{businessDate:new Date('2026-11-09T00:00:00Z')}});
 expect(nov9).not.toBeNull();
 const entries=await state.db.dayBookExpenseEntry.findMany({where:{dayBookId:nov9.id}});
 expect(entries.map((e:any)=>e.amount)).toContain(210);
 expect(await state.db.dayBook.count()).toBe(1); // no wrong Nov 8 book created
});
