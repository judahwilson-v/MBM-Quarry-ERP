import {it,expect} from 'vitest';import {PrismaClient} from '@prisma/client';import {initializeDatabase} from '../../src/lib/bootstrap';import fs from 'node:fs';import os from 'node:os';
it('actual blank bootstrap sequential and two simultaneous initializers ownership evidence',async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/mbm-blank-bootstrap-');
 for(const count of [1,2]){const dbs=Array.from({length:count},()=>new PrismaClient({datasources:{db:{url:`file:${root}/${count}.db?connection_limit=2&socket_timeout=1`}}}));const started=Date.now();const results=await Promise.allSettled(dbs.map(db=>initializeDatabase(db)));console.log('BLANK_BOOTSTRAP',JSON.stringify({pid:process.pid,count,ms:Date.now()-started,results:results.map(r=>r.status==='fulfilled'?{status:r.status}:{status:r.status,error:String(r.reason)})}));await Promise.all(dbs.map(db=>db.$disconnect()));expect(results.every(r=>r.status==='fulfilled')).toBe(true);}
},90000);
