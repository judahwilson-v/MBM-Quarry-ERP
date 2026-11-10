import {it,expect} from 'vitest';import {PrismaClient} from '@prisma/client';import {runMigrations} from '../../src/lib/migrations/runner';import fs from 'node:fs';import os from 'node:os';
it('failed migration rolls back DDL and record, stops later versions, preserves existing data and retries cleanly',async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/mbm-rollback-');const db=new PrismaClient({datasources:{db:{url:`file:${root}/fixture.db`}}});
 try{
 await db.$executeRawUnsafe('CREATE TABLE preserved (id TEXT PRIMARY KEY)');await db.$executeRawUnsafe("INSERT INTO preserved VALUES ('keep')");
 const broken={version:1,id:'synthetic_failure',description:'test',up:async()=>['CREATE TABLE rolled_back (id TEXT)','INSERT INTO nonexistent VALUES (1)']};const later={version:2,id:'later',description:'test',up:async()=>['CREATE TABLE later (id TEXT)']};
 const failed=await runMigrations(db,[broken,later]);expect(failed.applied).toBe(0);expect(failed.errors).toHaveLength(1);
 expect(await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name IN ('rolled_back','later')")).toEqual([]);expect(await db.$queryRawUnsafe('SELECT version FROM schema_migrations')).toEqual([]);expect(await db.$queryRawUnsafe('SELECT id FROM preserved')).toEqual([{id:'keep'}]);
 const repaired={...broken,up:async()=>['CREATE TABLE rolled_back (id TEXT)']};expect((await runMigrations(db,[repaired,later])).applied).toBe(2);expect((await runMigrations(db,[repaired,later])).applied).toBe(0);
 }finally{await db.$disconnect();}
});
it('overlapping nonmigration read uses separate pool connection without stealing transaction ownership',async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/mbm-reader-');const db=new PrismaClient({datasources:{db:{url:`file:${root}/fixture.db?connection_limit=2`}}});let outsideRead:Promise<any>|undefined;
 try{const result=await runMigrations(db,[{version:1,id:'concurrent_read',description:'test',up:async(tx)=>{outsideRead=db.$queryRawUnsafe('WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<500000) SELECT sum(n) FROM x');await new Promise(r=>setTimeout(r,10));return ['CREATE TABLE owner_safe (id INTEGER)'];}}]);await outsideRead;expect(result.errors).toEqual([]);expect(result.applied).toBe(1);}finally{await db.$disconnect();}
});
