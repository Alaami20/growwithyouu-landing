import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord,validateMember} from '../server/policy.js';
import {metrics} from '../src/admin/metrics.js';
import {configured,checkPassword,hashPassword,issueSession,verifySession,sessionCookie,COOKIE} from '../server/auth.js';
import {createGuard} from '../server/access.js';
import {createAuthHandler} from '../api/admin/auth.js';
import {memoryStore,response,authEnv} from './helpers.js';
const request=(method,body,extra={})=>({method,headers:{origin:authEnv.ADMIN_ORIGIN,'content-type':'application/json',...extra},body});
test('server configuration allows only CEO email; password validation supports hashes',()=>{
 assert.equal(configured(authEnv),true);
 assert.equal(configured({...authEnv,CEO_VERIFIED_EMAIL:'other@example.test'}),false);
 for(const key of ['ADMIN_PASSWORD','BLOB_READ_WRITE_TOKEN','ADMIN_ORIGIN'])assert.equal(configured({...authEnv,[key]:''}),false);
 assert.equal(configured({...authEnv,ADMIN_SESSION_SECRET:'too-short'}),false);
 assert.equal(checkPassword('wrong',authEnv),false);assert.equal(checkPassword(authEnv.ADMIN_PASSWORD,authEnv),true);
 const hash=hashPassword('test-secret','a'.repeat(32));assert.equal(checkPassword('test-secret',{ADMIN_PASSWORD_HASH:hash}),true);assert.equal(checkPassword('wrong',{ADMIN_PASSWORD_HASH:hash}),false);
});
test('session signatures, expiry, credential changes, revocation epochs and secure cookies',()=>{
 const now=Date.now(),token=issueSession(1,authEnv,now);
 assert.equal(verifySession(token,1,authEnv,now).email,authEnv.CEO_VERIFIED_EMAIL);
 for(const invalid of [token+'x','invalid',token.split('.')[0]+'.bad'])assert.equal(verifySession(invalid,1,authEnv,now),null);
 assert.equal(verifySession(token,2,authEnv,now),null);
 assert.equal(verifySession(token,1,authEnv,now+8*3600000),null);
 assert.equal(verifySession(token,1,{...authEnv,ADMIN_PASSWORD:'changed'},now),null);
 const cookie=sessionCookie(token);for(const value of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(value));
});
test('login, protected access, cross-origin rejection and global logout work end to end',async()=>{
 const store=memoryStore(),auth=createAuthHandler(authEnv,store),guard=createGuard(authEnv,store);
 let res=response();await auth(request('POST',{email:authEnv.CEO_VERIFIED_EMAIL,password:authEnv.ADMIN_PASSWORD}),res);assert.equal(res.code,200);const cookie=res.headers['Set-Cookie'].split(';')[0];
 res=response();assert.equal((await guard(request('GET',null,{cookie}),res)).user.email,authEnv.CEO_VERIFIED_EMAIL);
 res=response();await guard(request('GET',null,{Authorization:'Bearer fake'}),res);assert.equal(res.code,401);
 res=response();await guard(request('POST',{}, {cookie,origin:'https://attacker.test'}),res);assert.equal(res.code,403);
 res=response();await auth(request('DELETE',null,{cookie}),res);assert.equal(res.code,200);
 res=response();await guard(request('GET',null,{cookie}),res);assert.equal(res.code,401);
});
test('wrong email is denied; login throttling persists across independent handler instances',async()=>{
 const store=memoryStore();let res=response();
 await createAuthHandler(authEnv,store)(request('POST',{email:'someone@example.test',password:authEnv.ADMIN_PASSWORD}),res);assert.equal(res.code,401);
 for(let i=0;i<4;i++){res=response();await createAuthHandler(authEnv,store)(request('POST',{email:authEnv.CEO_VERIFIED_EMAIL,password:'wrong'}),res);assert.equal(res.code,401);}
 res=response();await createAuthHandler(authEnv,store)(request('POST',{email:authEnv.CEO_VERIFIED_EMAIL,password:authEnv.ADMIN_PASSWORD}),res);assert.equal(res.code,429);assert.equal(res.headers['Retry-After'],'900');
});
test('authentication fails closed when persistent throttling storage fails',async()=>{
 const res=response();await createAuthHandler(authEnv,{change:async()=>{throw Error('offline');}})(request('POST',{email:authEnv.CEO_VERIFIED_EMAIL,password:authEnv.ADMIN_PASSWORD}),res);assert.equal(res.code,503);assert.equal(res.headers['Set-Cookie'],undefined);
 const missing=response();await createGuard({},memoryStore())(request('GET'),missing);assert.equal(missing.code,503);assert.equal(missing.headers['Cache-Control'],'no-store');
});
test('record validation rejects unsafe URLs, unsupported fields and malformed references',()=>{
 const base={title:'Task',status:'planned',priority:'P1'};assert.equal(validateRecord(base).title,'Task');
 for(const v of [{title:''},{evidence_url:'javascript:alert(1)'},{evidence_url:'http://example.test'},{amount:'4'},{amount:Infinity},{owner_id:'no'},{currency:'usd'},{secret:'x'},{status:'fake'},{financial_type:'profit'}])assert.throws(()=>validateRecord({...base,...v}));
 assert.throws(()=>validateMember({name:'person',status:'active',id:'injected'}));
});
test('metrics count a shared member once and ignore completed tasks in overdue counts',()=>{
 const data={members:[{id:'one',status:'active'},{id:'two',status:'inactive'}],memberships:[{member_id:'one',project_id:'a',status:'active'},{member_id:'one',project_id:'b',status:'active'}],records:[{kind:'tasks',project_id:'a',status:'completed',due_date:'2026-01-01'},{kind:'tasks',project_id:'a',status:'blocked',due_date:'2026-01-01'}]};assert.equal(metrics(data,'','2026-11-08').members,1);assert.equal(metrics(data,'a','2026-11-08').overdue,1);
});
test('Vercel-only setup creates and reuses a private signing key when no override is set',async()=>{
 const env={...authEnv};delete env.ADMIN_SESSION_SECRET;const store=memoryStore();
 let res=response();await createAuthHandler(env,store)(request('POST',{email:env.CEO_VERIFIED_EMAIL,password:env.ADMIN_PASSWORD}),res);assert.equal(res.code,200);
 const cookie=res.headers['Set-Cookie'].split(';')[0],first=(await store.read('security')).value.session_key;
 res=response();assert.equal((await createGuard(env,store)(request('GET',null,{cookie}),res)).user.email,env.CEO_VERIFIED_EMAIL);
 assert.equal((await store.read('security')).value.session_key,first);assert.ok(first.length>=64);
});
