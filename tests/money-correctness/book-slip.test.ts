import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {PrismaClient} from '@prisma/client';import {copyFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/prisma',()=>({getDb:async()=>state.db}));
vi.mock('@/lib/sync/auto-sync',()=>({triggerAutoSync:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getLastBookPage, checkDuplicateSaleBookNumber} from '../../src/app/actions/sales';
let n=0;
beforeEach(async()=>{const root=process.env.MBM_TEST_ROOT;if(!root)throw Error('isolated fixture required');const f=`${root}/bookslip-${++n}.db`;copyFileSync(`${root}/fixture.db`,f);state.db=new PrismaClient({datasources:{db:{url:`file:${f}`}}});});
afterEach(async()=>{await state.db.$disconnect();});

async function sale(book:number,page:number){return state.db.outgoingSale.create({data:{saleDate:new Date('2026-11-09T04:00:00Z'),bookNumber:book,pageNumber:page,vehicleNumber:'ZZQATEST0009',partyName:'Synthetic',materialName:'ROCK',ratePerCft:20,qty:10,amount:200,finalAmount:200}});}
async function boulder(book:number,page:number){return state.db.incomingBoulder.create({data:{date:new Date('2026-11-09T04:00:00Z'),bookNumber:book,pageNumber:page,vehicleNumber:'ZZQATEST0010',partyName:'Synthetic',materialName:'ROCK',qty:10}});}

it('empty book starts at book 1 page 0',async()=>{
 expect(await getLastBookPage()).toEqual({bookNumber:1,pageNumber:0});
});
it('last page is the max across BOTH sales and boulders, book first then page',async()=>{
 await sale(4,8);await sale(4,9);await boulder(5,2);
 expect(await getLastBookPage()).toEqual({bookNumber:5,pageNumber:2});
 await sale(5,7);
 expect(await getLastBookPage()).toEqual({bookNumber:5,pageNumber:7});
});
it('deleting the latest entry falls back to the remaining max; identities are not renumbered',async()=>{
 const a=await sale(4,8);const b=await sale(4,9);
 expect(await getLastBookPage()).toEqual({bookNumber:4,pageNumber:9});
 await state.db.outgoingSale.delete({where:{id:b.id}});
 expect(await getLastBookPage()).toEqual({bookNumber:4,pageNumber:8});
 const survivor=await state.db.outgoingSale.findUnique({where:{id:a.id}});
 expect(survivor.pageNumber).toBe(8); // surviving row identity unchanged
});
it('duplicate detection spans sales and boulders; excludeId exempts the row being edited',async()=>{
 const s=await sale(4,8);
 expect(await checkDuplicateSaleBookNumber(4,8)).toBe(true); // sale collision
 expect(await checkDuplicateSaleBookNumber(4,8,s.id)).toBe(false); // editing the same row
 expect(await checkDuplicateSaleBookNumber(4,9)).toBe(false); // free page, same book
 expect(await checkDuplicateSaleBookNumber(5,8)).toBe(false); // same page, different book
 await boulder(5,8);
 expect(await checkDuplicateSaleBookNumber(5,8)).toBe(true); // boulder collision counts
});
