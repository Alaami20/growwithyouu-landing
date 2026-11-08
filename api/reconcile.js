import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {headers} from '../server/access.js';
import {repositoryMap,snapshotRepository} from '../server/github.js';
export default async function handler(req,res){headers(res);const secret=process.env.CRON_SECRET,received=req.headers.authorization||'',expected='Bearer '+secret;if(!secret||received.length!==expected.length||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return res.status(401).end();if(!['GET','POST'].includes(req.method))return res.status(405).end();if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).end();const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const bucket=new Date().toISOString().slice(0,13);let completed=0,failed=0;
 try{
 for(const repository of Object.keys(repositoryMap())){const {error}=await db.from('github_jobs').upsert({delivery_id:'reconcile:'+bucket+':'+repository,repository,event_type:'reconcile'},{onConflict:'delivery_id',ignoreDuplicates:true});if(error)throw error;}
 for(let n=0;n<3;n++){const {data:jobs,error}=await db.rpc('admin_claim_github_job');if(error)throw error;if(!jobs?.length)break;const job=jobs[0];try{const snapshot=await snapshotRepository(job.repository);const {error:se}=await db.from('github_snapshots').upsert({repository:job.repository,snapshot,updated_at:snapshot.updated_at},{onConflict:'repository'});if(se)throw se;const {error:je}=await db.from('github_jobs').update({status:'completed',last_error:null,locked_at:null}).eq('id',job.id);if(je)throw je;completed++;}catch(e){failed++;const {error:je}=await db.from('github_jobs').update({status:job.attempts>=5?'failed':'pending',last_error:String(e.message).slice(0,200),locked_at:null,next_attempt_at:new Date(Date.now()+Math.min(3600000,2**job.attempts*60000)).toISOString()}).eq('id',job.id);if(je)throw je;}}
 res.json({completed,failed});
 }catch{return res.status(503).json({error:'Synchronization storage unavailable'});}
}
