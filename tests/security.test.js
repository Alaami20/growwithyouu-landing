import test from 'node:test';
import assert from 'node:assert/strict';
import {authorize,validateRecord,validateMember} from '../server/policy.js';
import {metrics} from '../src/admin/metrics.js';
import handler from '../api/admin/data.js';
const token=aal=>'x.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.x';
const env={CEO_USER_ID:'ceo',CEO_VERIFIED_EMAIL:'alaamiari@growwithyouu.com'};
const user={id:'ceo',email:'ALAAMIARI@growwithyouu.com',email_confirmed_at:'2026-01-01'};
test('authorization denies mismatched IDs, emails, unverified accounts and missing MFA',()=>{
 assert.equal(authorize(user,token('aal2'),env),true);
 for(const u of [null,{...user,id:'other'},{...user,email:'other@example.test'},{...user,email_confirmed_at:null}])assert.equal(authorize(u,token('aal2'),env),false);
 assert.equal(authorize({...user,email:'other@example.test'},token('aal2'),{...env,CEO_VERIFIED_EMAIL:'other@example.test'}),false);
 assert.equal(authorize(user,token('aal1'),env),false);assert.equal(authorize(user,'bad',env),false);assert.equal(authorize(user,token('aal2'),{}),false);
});
test('record validation rejects unsafe URLs, unsupported fields and malformed references',()=>{
 const base={title:'Task',status:'planned',priority:'P1'};
 assert.equal(validateRecord(base).title,'Task');
 for(const v of [{title:''},{evidence_url:'javascript:alert(1)'},{evidence_url:'http://example.test'},{amount:'4'},{amount:Infinity},{owner_id:'no'},{currency:'usd'},{secret:'x'},{status:'fake'},{financial_type:'profit'}])assert.throws(()=>validateRecord({...base,...v}));
 assert.throws(()=>validateMember({name:'person',status:'active',id:'injected'}));
});
test('metrics count a shared member once and do not treat completed tasks as overdue',()=>{
 const data={members:[{id:'one',status:'active'},{id:'two',status:'inactive'}],memberships:[{member_id:'one',project_id:'a',status:'active'},{member_id:'one',project_id:'b',status:'active'}],records:[{kind:'tasks',project_id:'a',status:'completed',due_date:'2026-01-01'},{kind:'tasks',project_id:'a',status:'blocked',due_date:'2026-01-01'}]};
 assert.equal(metrics(data,'','2026-11-08').members,1);assert.equal(metrics(data,'a','2026-11-08').overdue,1);assert.equal(metrics(data,'a').completed,1);
});
test('admin API fails closed without configuration',async()=>{
 const saved=process.env.SUPABASE_URL;delete process.env.SUPABASE_URL;
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 try{await handler({method:'GET',headers:{}},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');assert.match(res.body.error,/not configured/);}finally{if(saved)process.env.SUPABASE_URL=saved;}
});
