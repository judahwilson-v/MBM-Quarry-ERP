import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
// Auth is intentionally NOT mocked in this file: real verifyEditPassword with seeded PINs.
import {saveFuelPurchase} from '../../src/app/actions/fuel';
import {updateMaterialRate} from '../../src/app/actions/materials';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/authz-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});await state.db.globalSettings.create({data:{id:'default',deletePin:'424242',adminPin:'313131'}});});
afterEach(async()=>{vi.clearAllTimers();vi.useRealTimers();await state.db.$disconnect();});

it.each([undefined,'wrong-synthetic-pin'])('fuel edit requires the admin PIN server-side (%s) without mutating fuel, mirror or Day Book',async(pin)=>{
 const fuel=await saveFuelPurchase({date:'2026-11-09',fuelType:'DIESEL',amount:200,paidAmount:200,isCan:true});
 await expect(saveFuelPurchase({id:fuel.id,date:'2026-11-09',fuelType:'DIESEL',amount:210,paidAmount:210,isCan:true},pin as any)).rejects.toThrow(/PIN/);
 expect((await state.db.fuelPurchase.findFirst()).amount).toBe(200);
 expect((await state.db.expense.findFirst()).amount).toBe(200);
 expect((await state.db.dayBookExpenseEntry.findFirst()).amount).toBe(200);
});
it('fuel edit with the admin PIN succeeds and cascades to the mirrored expense',async()=>{
 const fuel=await saveFuelPurchase({date:'2026-11-09',fuelType:'DIESEL',amount:200,paidAmount:200,isCan:true});
 await saveFuelPurchase({id:fuel.id,date:'2026-11-09',fuelType:'DIESEL',amount:210,paidAmount:210,isCan:true},'313131');
 expect((await state.db.fuelPurchase.findFirst()).amount).toBe(210);
 expect((await state.db.expense.findFirst()).amount).toBe(210);
});
it.each([undefined,'wrong-synthetic-pin'])('material rate update requires the edit PIN server-side (%s) without mutation',async(pin)=>{
 await state.db.material.create({data:{materialName:'Synthetic Rock',ratePerCft:20}});
 const material=await state.db.material.findFirst();
 await expect(updateMaterialRate(material.id,25,pin as any)).rejects.toThrow(/PIN/);
 expect((await state.db.material.findFirst()).ratePerCft).toBe(20);
});
it('material rate update with the edit PIN succeeds',async()=>{
 await state.db.material.create({data:{materialName:'Synthetic Rock',ratePerCft:20}});
 const material=await state.db.material.findFirst();
 await updateMaterialRate(material.id,25,'313131');
 expect((await state.db.material.findFirst()).ratePerCft).toBe(25);
});
