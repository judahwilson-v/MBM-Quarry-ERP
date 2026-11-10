import {it,expect} from 'vitest';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {PrismaClient} from '@prisma/client';
it('separate processes initialize one blank database without duplicate migration markers',async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/mbm-process-owner-');const url=`file:${root}/shared.db`;
 const launch=()=>new Promise<any>(resolve=>{const p=spawn(process.execPath,['--import','tsx','first-run-child.ts'],{cwd:path.resolve(import.meta.dirname,'../..'),env:{NODE_ENV:'test',PATH:process.env.PATH,HOME:'/tmp',TMPDIR:'/tmp',DATABASE_URL:url,NODE_OPTIONS:`--require=${path.resolve(import.meta.dirname,'../../network-deny.cjs')}`}});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('close',code=>resolve({pid:p.pid,code,output}));});
 const results=await Promise.all([launch(),launch()]);console.log('PROCESS_OWNERSHIP',JSON.stringify(results));expect(results.map(r=>r.code)).toEqual([0,0]);
 const db=new PrismaClient({datasources:{db:{url}}});try{const markers=await db.$queryRawUnsafe<any[]>('SELECT version,COUNT(*) AS total FROM schema_migrations GROUP BY version ORDER BY version');expect(markers.map(x=>Number(x.total))).toEqual([1,1,1,1,1,1,1,1]);}finally{await db.$disconnect();}
},90000);
