import {guard} from '../../server/access.js';
import {enqueue} from '../../server/store.js';
import {repositoryMap} from '../../server/github.js';
export default async function handler(req,res){
 const a=await guard(req,res);if(!a)return;if(!['GET','POST'].includes(req.method))return res.status(405).end();
 const runtimeRepos=Object.keys(repositoryMap());
 try{
  const {value}=await a.store.read();const repos=[...new Set([...runtimeRepos,...Object.keys(value.github_repository_map||{})])];if(!repos.length)return res.json({status:'Not connected',repositories:[],errors:[],updated_at:null});
  if(req.method==='POST'){if(!runtimeRepos.length)return res.status(503).json({error:'Historical connector snapshots are available; ongoing GitHub App synchronization requires authorization'});await a.store.change(state=>{for(const repository of runtimeRepos)enqueue(state,{delivery_id:'manual:'+new Date().toISOString().slice(0,16)+':'+repository,repository,event_type:'manual'});});return res.status(202).json({queued:repos.length,status:'Queued for authenticated scheduler'});}
  const rows=value.github_snapshots.filter(x=>repos.includes(x.repository));
  res.json({status:rows.length?(runtimeRepos.length?'Cached synchronized data':'Source snapshot; live GitHub App not connected'):'Awaiting first synchronization',repositories:rows.map(x=>x.snapshot),errors:value.github_jobs.filter(x=>repos.includes(x.repository)&&['failed','pending'].includes(x.status)&&x.last_error).slice(-20).reverse().map(x=>({repository:x.repository,event_type:x.event_type,attempts:x.attempts,error:x.last_error,created_at:x.created_at})),updated_at:rows.length?rows.map(x=>x.updated_at).sort()[0]:null});
 }catch{return res.status(503).json({error:'GitHub storage unavailable'});}
}
