import {guard} from '../../server/access.js';
import {unavailable,allocation,validateAllocation} from '../../server/cloud-model.js';
import {synchronizeAzure} from '../../server/azure.js';
import {synchronizeAWS} from '../../server/aws.js';
import {randomUUID} from 'node:crypto';
export const maxDuration=300;
export default async function handler(req,res){const a=await guard(req,res);if(!a)return;
 try{
 if(req.method==='GET'){const {value}=await a.store.read();const snapshots=['azure','aws'].map(provider=>{const saved=value.cloud_snapshots?.[provider]||unavailable(provider,'No verified synchronization yet');return {...saved,resources:saved.resources.map(r=>({...r,allocation:allocation(r,value.cloud_allocations||[])}))};});return res.json({snapshots,allocations:value.cloud_allocations||[],updated_at:value.cloud_updated_at||null});}
 if(req.method!=='POST')return res.status(405).end();
 if(req.body?.action==='allocate'){const values=validateAllocation(req.body.values);await a.store.change(s=>{if(!s.cloud_snapshots?.[values.provider]?.resources.some(r=>r.id===values.resource_id))throw Error('Unknown resource');s.cloud_allocations||=[];const index=s.cloud_allocations.findIndex(x=>x.resource_id===values.resource_id&&x.provider===values.provider);const before=index<0?null:s.cloud_allocations[index];if((before?.version||0)!==req.body.version){const e=Error('Allocation changed; refresh before editing');e.status=409;throw e;}const row={...values,version:(before?.version||0)+1,updated_at:new Date().toISOString()};if(index<0)s.cloud_allocations.push(row);else s.cloud_allocations[index]=row;s.audit_events.push({id:randomUUID(),entity:'cloud_allocations',action:before?'UPDATE':'INSERT',actor_id:a.user.id,before_data:before,after_data:row,created_at:row.updated_at});});return res.json({saved:true});}
 if(req.body?.action!=='synchronize'||!['azure','aws'].includes(req.body.provider))return res.status(400).json({error:'Invalid cloud action'});
 const provider=req.body.provider,now=Date.now(),lease=randomUUID();
 const allowed=await a.store.change(s=>{s.cloud_locks||={};const prior=s.cloud_locks[provider];if(prior&&prior.until>now)return false;s.cloud_locks[provider]={lease,until:now+300000};return true;});if(!allowed)return res.status(429).json({error:'Synchronization already running or cooling down; retry in five minutes'});
 const snapshot=await (provider==='azure'?synchronizeAzure():synchronizeAWS());
 await a.store.change(s=>{if(s.cloud_locks?.[provider]?.lease!==lease)return;s.cloud_snapshots||={};s.cloud_snapshots[provider]=snapshot;s.cloud_updated_at=new Date().toISOString();s.audit_events.push({id:randomUUID(),entity:'cloud_sync',action:'READ_SYNC',actor_id:a.user.id,before_data:null,after_data:{provider,status:snapshot.status},created_at:s.cloud_updated_at});});return res.json({snapshot});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Cloud operation could not complete; check authorization and refresh'});}}
