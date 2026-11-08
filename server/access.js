import {configured,cookieToken,verifySession,originAllowed,runtimeAuthEnv} from './auth.js';
import {storage,consumeBudget} from './store.js';
export function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');}
export function createGuard(env=process.env,store=storage){return async function(req,res){
 headers(res);
 if(!configured(env)){res.status(503).json({error:'Private login or storage not configured'});return null;}
 if(!originAllowed(req,env)){res.status(403).json({error:'Forbidden origin'});return null;}
 const token=cookieToken(req);if(!token){res.status(401).json({error:'Sign in required'});return null;}
 try{
  const {value:security}=await store.read('security');const user=verifySession(token,security.epoch,runtimeAuthEnv(env,security));
  if(!user){res.setHeader('Set-Cookie',`${'__Host-gwu_admin'}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);res.status(401).json({error:'Session ended. Sign in again.'});return null;}
  const allowed=await store.change(state=>consumeBudget(state,'api:'+user.jti,120,60000),'security');
  if(!allowed){res.setHeader('Retry-After','60');res.status(429).json({error:'Too many requests'});return null;}
  return {user,store};
 }catch{res.status(503).json({error:'Private storage unavailable'});return null;}
};}
export const guard=createGuard();
