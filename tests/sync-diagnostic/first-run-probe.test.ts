import {it,expect} from 'vitest';import {PrismaClient} from '@prisma/client';import {runMigrations} from '../../src/lib/migrations/runner';import {ALL_MIGRATIONS} from '../../src/lib/migrations';import fs from 'node:fs';import os from 'node:os';
const root=fs.mkdtempSync(os.tmpdir()+'/mbm-first-run-');
async function attempt(label:string,url:string){const db=new PrismaClient({datasources:{db:{url}}});const started=Date.now();let result:any;try{result=await runMigrations(db,ALL_MIGRATIONS);}catch(e:any){result={fatal:e.message};}finally{await db.$disconnect();}console.log('PROBE',JSON.stringify({pid:process.pid,label,ms:Date.now()-started,...result}));expect(result.errors).toEqual([]);expect(result.applied).toBe(8);}
it('sequential first-run connection probe',async()=>{for(const mode of ['default','single'])for(let i=0;i<2;i++)await attempt(`${mode}-${i}`,`file:${root}/${mode}-${i}.db${mode==='single'?'?connection_limit=1':''}`);

},90000);
