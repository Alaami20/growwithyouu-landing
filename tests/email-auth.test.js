import test from 'node:test';
import assert from 'node:assert/strict';
import {CEO_EMAIL,requestEmailCode,verifyEmailCode} from '../src/admin/email-auth.js';
test('email sign-in uses only CEO account and cannot create a new account',async()=>{
 let request;await requestEmailCode({auth:{signInWithOtp:async v=>(request=v,{error:null})}});
 assert.deepEqual(request,{email:CEO_EMAIL,options:{shouldCreateUser:false}});
});
test('email verification binds code to CEO email and requires a verified identity',async()=>{
 let request;const user={email:CEO_EMAIL,email_confirmed_at:'2026-11-08'};
 const client={auth:{verifyOtp:async v=>(request=v,{data:{user},error:null})}};
 assert.equal((await verifyEmailCode(client,'123456')).user,user);
 assert.deepEqual(request,{email:CEO_EMAIL,token:'123456',type:'email'});
 await assert.rejects(()=>verifyEmailCode(client,'bad'),/numeric code/);
 for(const invalid of [{email:'other@example.test',email_confirmed_at:'yes'},{email:CEO_EMAIL}]){
  let signedOut=false;await assert.rejects(()=>verifyEmailCode({auth:{verifyOtp:async()=>({data:{user:invalid}}),signOut:async()=>{signedOut=true;}}},'123456'),/Verified CEO/);assert.equal(signedOut,true);
 }
});
test('provider errors propagate without bypassing verification',async()=>{
 const error=Error('Expired code');
 await assert.rejects(()=>verifyEmailCode({auth:{verifyOtp:async()=>({error})}},'123456'),/Expired code/);
 await assert.rejects(()=>requestEmailCode({auth:{signInWithOtp:async()=>({error})}}),/Expired code/);
});
