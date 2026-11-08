import {createHmac,timingSafeEqual,scryptSync,randomUUID} from 'node:crypto';
import {CEO_EMAIL} from './policy.js';
export const COOKIE='__Host-gwu_admin';
export const SESSION_SECONDS=8*60*60;
export function configured(env=process.env){return env.CEO_VERIFIED_EMAIL?.toLowerCase()===CEO_EMAIL&&!!(env.ADMIN_PASSWORD_HASH||env.ADMIN_PASSWORD)&&(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length>=32)&&/^https:\/\//.test(env.ADMIN_ORIGIN||'')&&!!env.BLOB_READ_WRITE_TOKEN;}
const signingKey=env=>createHmac('sha256',env.ADMIN_SESSION_SECRET).update('gwu-session-v2\0'+CEO_EMAIL+'\0'+(env.ADMIN_PASSWORD_HASH||env.ADMIN_PASSWORD)).digest();
export function hashPassword(password,salt){return 'scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex');}
export function runtimeAuthEnv(env,security){return {...env,ADMIN_SESSION_SECRET:env.ADMIN_SESSION_SECRET||security.session_key};}
export function checkPassword(password,env=process.env){
 if(typeof password!=='string'||password.length>1024)return false;
 let salt,expected;
 if(env.ADMIN_PASSWORD_HASH){const m=env.ADMIN_PASSWORD_HASH.match(/^scrypt:([a-f0-9]{32,128}):([a-f0-9]{128})$/);if(!m)return false;[,salt,expected]=m;}
 else {if(!env.ADMIN_PASSWORD)return false;salt=env.ADMIN_SESSION_SECRET;expected=scryptSync(env.ADMIN_PASSWORD,salt,64).toString('hex');}
 return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));
}
export function issueSession(epoch,env=process.env,now=Date.now()){
 const iat=Math.floor(now/1000),payload=Buffer.from(JSON.stringify({email:CEO_EMAIL,epoch,iat,exp:iat+SESSION_SECONDS,jti:randomUUID()})).toString('base64url');
 return payload+'.'+createHmac('sha256',signingKey(env)).update(payload).digest('base64url');
}
export function verifySession(token,epoch,env=process.env,now=Date.now()){
 try{
  if(!configured(env)||typeof token!=='string'||token.length>2048)return null;
  const parts=token.split('.');if(parts.length!==2)return null;
  const expected=createHmac('sha256',signingKey(env)).update(parts[0]).digest(),received=Buffer.from(parts[1],'base64url');
  if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
  const data=JSON.parse(Buffer.from(parts[0],'base64url'));
  const sec=Math.floor(now/1000);
  if(data.email!==CEO_EMAIL||data.epoch!==epoch||!Number.isInteger(data.iat)||!Number.isInteger(data.exp)||data.iat>sec||data.exp<=sec||data.exp-data.iat!==SESSION_SECONDS||typeof data.jti!=='string')return null;
  return {id:CEO_EMAIL,email:CEO_EMAIL,jti:data.jti};
 }catch{return null;}
}
export function sessionCookie(token,maxAge=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export function cookieToken(req){const found=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));return found.length===1?found[0].slice(COOKIE.length+1):null;}
export function originAllowed(req,env=process.env){return (!req.headers.origin||req.headers.origin===env.ADMIN_ORIGIN)&&(['GET','HEAD'].includes(req.method)||req.headers.origin===env.ADMIN_ORIGIN);}
export function clientKey(req,env=process.env){const address=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';return createHmac('sha256',env.ADMIN_SESSION_SECRET).update(String(address).split(',')[0].trim()).digest('hex');}
