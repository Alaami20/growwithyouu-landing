import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('migration, atomic audit, optimistic conflicts, database isolation and rate limits',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const sql=(await readFile(new URL('../database/001_command_center.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
 await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select count(*)::int n from projects')).rows[0].n,3);
 const syncSql=await readFile(new URL('../database/002_github_sync.sql',import.meta.url),'utf8');
 await db.exec(syncSql);await db.exec(syncSql);
 await db.exec("insert into github_jobs(delivery_id,repository,event_type) values('delivery-1','owner/repo','push') on conflict(delivery_id) do nothing");
 assert.equal((await db.query('select * from admin_claim_github_job()')).rows[0].attempts,1);
 assert.equal((await db.query('select * from admin_claim_github_job()')).rows.length,0);
 await db.exec("update github_jobs set locked_at=now()-interval '11 minutes'");
 assert.equal((await db.query('select * from admin_claim_github_job()')).rows[0].attempts,2);
 await db.exec('set role anon');
 await assert.rejects(()=>db.query('select * from github_snapshots'),/permission denied/);
 await assert.rejects(()=>db.query('select * from admin_claim_github_job()'),/permission denied/);
 await db.exec('reset role');
 const actor='11111111-1111-1111-1111-111111111111';
 const mutate=(entity,id,version,payload)=>db.query('select admin_mutate($1,$2,$3,$4::jsonb,$5) result',[entity,id,version,JSON.stringify(payload),actor]);
 const member=(await mutate('members',null,null,{name:'Test Owner',status:'active'})).rows[0].result;
 assert.equal(member.version,1);assert.equal((await db.query('select * from audit_events')).rows.length,1);
 const change=(await mutate('members',member.id,1,{name:'Updated Owner',status:'active'})).rows[0].result;
 assert.equal(change.version,2);
 await assert.rejects(()=>mutate('members',member.id,1,{name:'Stale',status:'active'}),/conflict/);
 await assert.rejects(()=>mutate('audit_events',null,null,{name:'unsafe'}),/invalid entity/);
 await assert.rejects(()=>mutate('members',null,null,{name:'unsafe',version:10}),/invalid field/);
 assert.equal((await db.query('select count(*)::int n from audit_events')).rows[0].n,2);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from members'),/permission denied/);await assert.rejects(()=>mutate('members',null,null,{name:'attacker'}),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from audit_events'),/permission denied/);await db.exec('reset role');
 for(let i=0;i<120;i++)assert.equal((await db.query('select admin_take_rate_limit($1) ok',[actor])).rows[0].ok,true);
 assert.equal((await db.query('select admin_take_rate_limit($1) ok',[actor])).rows[0].ok,false);
 }finally{await db.close();}
});
