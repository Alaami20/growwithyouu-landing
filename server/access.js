import {createClient} from '@supabase/supabase-js';
import {authorize} from './policy.js';
export function headers(res) {
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
}
export async function guard(req,res) {
  headers(res);const env=process.env;
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!env.CEO_USER_ID||!env.CEO_VERIFIED_EMAIL||!env.ADMIN_ORIGIN) {res.status(503).json({error:'Admin not configured'});return null;}
  if(req.headers.origin && req.headers.origin!==env.ADMIN_ORIGIN) {res.status(403).json({error:'Forbidden origin'});return null;}
  if(!['GET','HEAD'].includes(req.method) && req.headers.origin!==env.ADMIN_ORIGIN) {res.status(403).json({error:'Origin required'});return null;}
  const token=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if(!token){res.status(401).json({error:'Sign in required'});return null;}
  const identity=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  let user,error;try{({data:{user},error}=await identity.auth.getUser(token));}catch{res.status(503).json({error:'Identity service unavailable'});return null;}
  if(error||!authorize(user,token,env)){res.status(403).json({error:'Verified CEO identity and MFA required'});return null;}
  const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const limit=await db.rpc('admin_take_rate_limit',{subject:user.id});
  if(limit.error){res.status(503).json({error:'Security service unavailable'});return null;}
  if(!limit.data){res.setHeader('Retry-After','60');res.status(429).json({error:'Too many requests'});return null;}
  return {db,user};
}
