import {guard} from '../../server/access.js';
import {kinds,validateRecord,validateMember,safeError} from '../../server/policy.js';
export default async function handler(req,res){
 const access=await guard(req,res);if(!access)return;const {db,user}=access;
 try{
 if(req.method==='GET'){
  const entries=await Promise.all(['projects','members','memberships','records','audit_events','integration_status'].map(async table=>{const q=db.from(table).select('*').limit(table==='audit_events'?100:1000);const {data,error}=await q.order(table==='audit_events'?'created_at':'id',{ascending:table!=='audit_events'});if(error)throw error;return [table,data];}));
  return res.json({data:Object.fromEntries(entries),updated_at:new Date().toISOString(),source:'Private operational database',limit:1000});
 }
 if(!['POST','PATCH'].includes(req.method))return res.status(405).end();
 if(Number(req.headers['content-length'])>50000||JSON.stringify(req.body||{}).length>50000)return res.status(413).json({error:'Payload too large'});
 const {entity,id,version,values,kind}=req.body||{};
 if(!['members','records','memberships'].includes(entity))return res.status(400).json({error:'Invalid entity'});
 if(req.method==='PATCH'&&(!/^[0-9a-f-]{36}$/i.test(id||'')||!Number.isInteger(version)||version<1))return res.status(400).json({error:'ID and version required'});
 let data;
 try{
 if(entity==='records'){if(!kinds.includes(kind))throw Error('Invalid record type');data={...validateRecord(values),kind};}
 else if(entity==='members')data=validateMember(values);
 else {if(!values||Object.keys(values).some(k=>!['member_id','project_id','status'].includes(k))||!['active','inactive'].includes(values.status)||!['member_id','project_id'].every(k=>/^[0-9a-f-]{36}$/i.test(values[k]||'')))throw Error('Invalid assignment');data=values;}
 }catch(e){return res.status(400).json({error:e.message});}
 const {data:result,error}=await db.rpc('admin_mutate',{entity_name:entity,row_id:id||null,expected_version:version||null,payload:data,actor_id:user.id});
 if(error){if(error.message.includes('conflict'))return res.status(409).json({error:'Record changed. Reload before saving.'});throw error;}
 return res.status(req.method==='POST'?201:200).json({data:result});
 }catch(error){console.error('Admin operation failed',{code:error.code||'unknown'});return res.status(500).json({error:safeError(error)});}
}
