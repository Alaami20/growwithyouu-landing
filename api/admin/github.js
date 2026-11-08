import {guard} from '../../server/access.js';
import {repositoryMap} from '../../server/github.js';
export default async function handler(req,res){
 const a=await guard(req,res);if(!a)return;if(req.method!=='GET')return res.status(405).end();
 const repos=Object.keys(repositoryMap());if(!repos.length)return res.json({status:'Not connected',repositories:[],errors:[],updated_at:null});
 try{
  const {value}=await a.store.read();const rows=value.github_snapshots.filter(x=>repos.includes(x.repository));
  res.json({status:rows.length?'Cached synchronized data':'Awaiting first synchronization',repositories:rows.map(x=>x.snapshot),errors:value.github_jobs.filter(x=>repos.includes(x.repository)&&x.status==='failed').slice(-20).reverse().map(x=>({repository:x.repository,event_type:x.event_type,attempts:x.attempts,error:x.last_error,created_at:x.created_at})),updated_at:rows.length?rows.map(x=>x.updated_at).sort()[0]:null});
 }catch{return res.status(503).json({error:'GitHub storage unavailable'});}
}
