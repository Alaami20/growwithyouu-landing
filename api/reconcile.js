import {timingSafeEqual} from 'node:crypto';
import {headers} from '../server/access.js';
import {storage,enqueue,claimJob} from '../server/store.js';
import {repositoryMap,snapshotRepository} from '../server/github.js';
export default async function handler(req,res){
 headers(res);const secret=process.env.CRON_SECRET,received=req.headers.authorization||'',expected='Bearer '+secret;
 if(!secret||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return res.status(401).end();
 if(!['GET','POST'].includes(req.method))return res.status(405).end();if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).end();
 const bucket=new Date().toISOString().slice(0,13);let completed=0,failed=0;
 try{
  await storage.change(state=>{for(const repository of Object.keys(repositoryMap()))enqueue(state,{delivery_id:'reconcile:'+bucket+':'+repository,repository,event_type:'reconcile'});});
  for(let n=0;n<3;n++){
   const job=await storage.change(state=>claimJob(state));if(!job)break;
   try{
    const snapshot=await snapshotRepository(job.repository);
    await storage.change(state=>{const current=state.github_jobs.find(x=>x.id===job.id);if(current?.lease!==job.lease)return;const row={repository:job.repository,snapshot,updated_at:snapshot.updated_at};const at=state.github_snapshots.findIndex(x=>x.repository===job.repository);if(at<0)state.github_snapshots.push(row);else state.github_snapshots[at]=row;Object.assign(current,{status:'completed',last_error:null,locked_at:null});});completed++;
   }catch(e){failed++;await storage.change(state=>{const current=state.github_jobs.find(x=>x.id===job.id);if(current?.lease!==job.lease)return;Object.assign(current,{status:job.attempts>=5?'failed':'pending',last_error:['GitHub App not configured','Repository not authorized','GitHub App authorization failed','GitHub permission or rate limit','GitHub request failed'].includes(e.message)?e.message:'Synchronization failed',locked_at:null,next_attempt_at:Date.now()+Math.min(3600000,2**job.attempts*60000)});});}
  }
  return res.json({completed,failed});
 }catch{return res.status(503).json({error:'Synchronization storage unavailable'});}
}
