import {get,put,head,BlobPreconditionFailedError,BlobNotFoundError} from '@vercel/blob';
import {randomUUID,randomBytes} from 'node:crypto';
const ROOT='command-center/v2';
export class StoreError extends Error {constructor(message,status=503){super(message);this.status=status;}}
export function initialState(){return {schema:2,projects:[{id:'00000000-0000-4000-8000-000000000001',name:'GrowWithYouu',description:'Company leadership and shared support'},{id:'00000000-0000-4000-8000-000000000002',name:'TripFly',description:'AI travel platform'},{id:'00000000-0000-4000-8000-000000000003',name:'Crypora',description:'Crypto intelligence and learning'}],members:[],memberships:[],records:[],audit_events:[],integration_status:['Google Drive recruitment','Website analytics','Billing','Travel providers','App Store Connect'].map(name=>({id:randomUUID(),name,status:'Not connected',updated_at:null})),github_snapshots:[],github_jobs:[]};}
const fresh=key=>key==='security'?{epoch:1,session_key:randomBytes(32).toString('hex'),buckets:{}}:initialState();
export function createStore(adapter={get,put,head},env=process.env){
 async function read(key='data'){
  if(!env.BLOB_READ_WRITE_TOKEN)throw new StoreError('Private storage not configured');
  const path=`${ROOT}/${key}.json`,options={token:env.BLOB_READ_WRITE_TOKEN,abortSignal:AbortSignal.timeout(12000)};
  // Read the API metadata before the body. Download responses may have HTTP
  // representation ETags (e.g. compression) that are not valid write preconditions.
  // A concurrent write after head() makes our put fail, so a newer body can never
  // be written with permission to overwrite a version we did not observe.
  let metadata;
  try{metadata=await adapter.head(path,options);}catch(error){if(error instanceof BlobNotFoundError||error.name==='BlobNotFoundError')return {value:fresh(key),etag:null};throw error;}
  if(!metadata?.etag)throw new StoreError('Storage metadata unavailable');
  const result=await adapter.get(path,{...options,access:'private',useCache:false});
  if(!result)throw new StoreError('Storage changed during read; refresh and retry',409);
  if(result.statusCode!==200||!result.stream||!result.blob?.url?.includes('.private.blob.vercel-storage.com/'))throw new StoreError('Private storage required');
  if(result.blob.size>20*1024*1024)throw new StoreError('Storage capacity reached; export and archive records',507);
  return {value:await new Response(result.stream).json(),etag:metadata.etag};
 }
 async function change(fn,key='data'){
  for(let attempt=0;attempt<6;attempt++){
   const {value,etag}=await read(key);const result=await fn(value);
   const body=JSON.stringify(value);if(Buffer.byteLength(body)>20*1024*1024)throw new StoreError('Storage capacity reached; export and archive records',507);
   try{await adapter.put(`${ROOT}/${key}.json`,body,{access:'private',token:env.BLOB_READ_WRITE_TOKEN,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false}),abortSignal:AbortSignal.timeout(12000)});return result;}
   catch(error){if(!(error instanceof BlobPreconditionFailedError)&&!['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error.name)&&!(/already exists/i.test(error.message)))throw error;}
  }
  throw new StoreError('Concurrent update; refresh and retry',409);
 }
 return {read,change};
}
export const storage=createStore();
export function consumeBudget(state,key,max,windowMs,now=Date.now()){
 for(const [name,b] of Object.entries(state.buckets))if(b.until<=now)delete state.buckets[name];
 const bucket=state.buckets[key]||{hits:0,until:now+windowMs};
 if(bucket.hits>=max)return false;
 bucket.hits++;state.buckets[key]=bucket;return true;
}
export function visibleData(state){return Object.fromEntries(['projects','members','memberships','records','audit_events','integration_status'].map(key=>[key,key==='audit_events'?[...state[key]].reverse().slice(0,100):state[key].slice(0,1000)]));}
export function mutateState(state,{entity,id,version,values},actor){
 if(!['members','memberships','records'].includes(entity))throw new StoreError('Invalid entity',400);
 const rows=state[entity],existing=id?rows.find(x=>x.id===id):null;
 if(id&&(!existing||existing.version!==version))throw new StoreError('Record changed. Reload before saving.',409);
 const row={...(existing||{id:randomUUID(),created_at:new Date().toISOString()}),...values,version:(existing?.version||0)+1,updated_at:new Date().toISOString()};
 const member=key=>!row[key]||state.members.some(x=>x.id===row[key]);
 if(entity==='records'&&(!member('owner_id')||!member('reviewer_id')||(row.project_id&&!state.projects.some(x=>x.id===row.project_id))))throw new StoreError('Referenced record does not exist',400);
 if(entity==='memberships'){
  if(!state.members.some(x=>x.id===row.member_id)||!state.projects.some(x=>x.id===row.project_id))throw new StoreError('Referenced record does not exist',400);
  if(rows.some(x=>x.id!==row.id&&x.member_id===row.member_id&&x.project_id===row.project_id))throw new StoreError('Assignment already exists',409);
 }
 if(entity==='members'){
  if(!member('manager_id')||row.manager_id===row.id)throw new StoreError('Invalid manager',400);
  const visited=new Set([row.id]);let parent=row.manager_id;
  while(parent){if(visited.has(parent))throw new StoreError('Reporting line creates a cycle',400);visited.add(parent);parent=state.members.find(x=>x.id===parent)?.manager_id;}
 }
 if(existing)rows[rows.indexOf(existing)]=row;else rows.push(row);
 state.audit_events.push({id:randomUUID(),entity,row_id:row.id,actor_id:actor,action:existing?'UPDATE':'INSERT',before_data:existing||null,after_data:row,created_at:new Date().toISOString()});
 return row;
}
export function enqueue(state,job){if(state.github_jobs.some(x=>x.delivery_id===job.delivery_id))return;state.github_jobs.push({id:randomUUID(),...job,status:'pending',attempts:0,next_attempt_at:Date.now(),locked_at:null,created_at:new Date().toISOString()});}
export function claimJob(state,now=Date.now()){
 const job=state.github_jobs.find(x=>(x.status==='pending'&&x.next_attempt_at<=now)||(x.status==='processing'&&x.locked_at<now-600000));
 if(!job)return null;job.status='processing';job.attempts++;job.locked_at=now;job.lease=randomUUID();return {...job};
}
