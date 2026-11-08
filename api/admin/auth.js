import {headers} from '../../server/access.js';
import {configured,checkPassword,issueSession,verifySession,cookieToken,sessionCookie,originAllowed,clientKey,runtimeAuthEnv} from '../../server/auth.js';
import {CEO_EMAIL} from '../../server/policy.js';
import {storage,consumeBudget} from '../../server/store.js';
export const config={api:{bodyParser:{sizeLimit:'12kb'}}};
export function createAuthHandler(env=process.env,store=storage){return async function(req,res){
 headers(res);
 if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).end();
 if(!configured(env))return res.status(503).json({error:'Private login or storage not configured'});
 if(!originAllowed(req,env))return res.status(403).json({error:'Forbidden origin'});
 try{
  if(req.method==='GET'){
   const token=cookieToken(req);if(!token)return res.json({authenticated:false});
   const {value}=await store.read('security');return res.json({authenticated:!!verifySession(token,value.epoch,runtimeAuthEnv(env,value))});
  }
  if(req.method==='DELETE'){
   const {value}=await store.read('security');const user=verifySession(cookieToken(req),value.epoch,runtimeAuthEnv(env,value));
   if(!user)return res.status(401).json({error:'Sign in required'});
   await store.change(s=>{s.epoch++;},'security');res.setHeader('Set-Cookie',sessionCookie('',0));return res.json({signed_out:true});
  }
  if(!String(req.headers['content-type']||'').startsWith('application/json')||JSON.stringify(req.body||{}).length>10000)return res.status(400).json({error:'Invalid request'});
  const budget=await store.change(state=>{
   const runtime=runtimeAuthEnv(env,state),key=clientKey(req,runtime);
   const perClient=consumeBudget(state,'login:'+key,5,15*60000),global=consumeBudget(state,'login:global',30,15*60000);
   return {allowed:perClient&&global,epoch:state.epoch,runtime};
  },'security');
  if(!budget.allowed){res.setHeader('Retry-After','900');return res.status(429).json({error:'Too many sign-in attempts. Try again in 15 minutes.'});}
  const {email,password}=req.body||{};
  const correct=checkPassword(password,budget.runtime);
  if(typeof email!=='string'||email.trim().toLowerCase()!==CEO_EMAIL||!correct)return res.status(401).json({error:'Email or password is incorrect'});
  res.setHeader('Set-Cookie',sessionCookie(issueSession(budget.epoch,budget.runtime)));
  return res.json({authenticated:true,email:CEO_EMAIL});
 }catch{return res.status(503).json({error:'Private login storage unavailable'});}
};}
export default createAuthHandler();
