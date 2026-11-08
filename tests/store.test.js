import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,mutateState,enqueue,claimJob,consumeBudget} from '../server/store.js';
import {memoryStore} from './helpers.js';
test('persistent edits and audit entries commit together, stale updates cannot overwrite',async()=>{
 const store=memoryStore();const member=await store.change(state=>mutateState(state,{entity:'members',values:{name:'Owner',status:'active'}},'ceo'));
 await store.change(state=>mutateState(state,{entity:'members',id:member.id,version:1,values:{name:'Updated',status:'active'}},'ceo'));
 await assert.rejects(()=>store.change(state=>mutateState(state,{entity:'members',id:member.id,version:1,values:{name:'Stale'}},'ceo')),/Record changed/);
 const {value}=await store.read();assert.equal(value.members[0].name,'Updated');assert.equal(value.audit_events.length,2);assert.equal(value.audit_events[1].before_data.name,'Owner');assert.equal(value.audit_events[1].after_data.name,'Updated');
});
test('concurrent writers retain both changes through conditional-write retries',async()=>{
 const store=memoryStore();await Promise.all(['Alice','Bob'].map(name=>store.change(state=>mutateState(state,{entity:'members',values:{name,status:'active'}},'ceo'))));
 const {value}=await store.read();assert.deepEqual(value.members.map(x=>x.name).sort(),['Alice','Bob']);assert.equal(value.audit_events.length,2);
});
test('references, duplicate assignments and reporting cycles are rejected atomically',async()=>{
 const store=memoryStore();const a=await store.change(s=>mutateState(s,{entity:'members',values:{name:'A',status:'active'}},'ceo'));
 const b=await store.change(s=>mutateState(s,{entity:'members',values:{name:'B',status:'active',manager_id:a.id}},'ceo'));
 await assert.rejects(()=>store.change(s=>mutateState(s,{entity:'members',id:a.id,version:1,values:{manager_id:b.id}},'ceo')),/cycle/);
 await assert.rejects(()=>store.change(s=>mutateState(s,{entity:'records',values:{owner_id:'missing'}},'ceo')),/does not exist/);
 const project=(await store.read()).value.projects[0].id;
 await store.change(s=>mutateState(s,{entity:'memberships',values:{member_id:a.id,project_id:project,status:'active'}},'ceo'));
 await assert.rejects(()=>store.change(s=>mutateState(s,{entity:'memberships',values:{member_id:a.id,project_id:project,status:'active'}},'ceo')),/already exists/);
 assert.equal((await store.read()).value.audit_events.length,3);
});
test('webhook jobs deduplicate, claims are exclusive and expired leases recover',async()=>{
 const store=memoryStore(),job={delivery_id:'delivery',repository:'owner/repo',event_type:'push'};
 await store.change(s=>{enqueue(s,job);enqueue(s,job);});
 const [a,b]=await Promise.all([store.change(s=>claimJob(s)),store.change(s=>claimJob(s))]);assert.equal([a,b].filter(Boolean).length,1);
 const claimed=a||b;assert.equal(claimed.attempts,1);
 const recovered=await store.change(s=>claimJob(s,Date.now()+601000));assert.equal(recovered.attempts,2);assert.notEqual(recovered.lease,claimed.lease);
});
test('private store rejects public blob responses and does not cache authoritative reads',async()=>{
 let options;const store=createStore({head:async()=>({etag:'api-tag'}),get:async(path,opts)=>(options=opts,{statusCode:200,stream:new Blob(['{}']).stream(),blob:{url:'https://test.public.blob.vercel-storage.com/data',size:2}})}, {BLOB_READ_WRITE_TOKEN:'test'});
 await assert.rejects(()=>store.read(),/Private storage required/);assert.equal(options.useCache,false);assert.equal(options.access,'private');
});
test('rate windows expire and old IP identifiers are pruned',()=>{
 const state={buckets:{}};assert.equal(consumeBudget(state,'one',1,1000,0),true);assert.equal(consumeBudget(state,'one',1,1000,500),false);assert.equal(consumeBudget(state,'two',1,1000,1001),true);assert.equal(state.buckets.one,undefined);
});

test('updates use authoritative API metadata when download representation ETags differ',async()=>{
 const store=memoryStore({representationEtags:true});
 const member=await store.change(s=>mutateState(s,{entity:'members',values:{name:'Owner',status:'active'}},'ceo'));
 const updated=await store.change(s=>mutateState(s,{entity:'members',id:member.id,version:1,values:{name:'Updated Owner'}},'ceo'));
 assert.equal(updated.version,2);const {value}=await store.read();assert.equal(value.members[0].name,'Updated Owner');assert.equal(value.audit_events.length,2);
});
