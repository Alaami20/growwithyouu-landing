import {guard} from '../../server/access.js';
import {kinds,validateRecord,validateMember} from '../../server/policy.js';
import {visibleData,mutateState} from '../../server/store.js';
export const config={api:{bodyParser:{sizeLimit:'64kb'}}};
export default async function handler(req,res){
 const access=await guard(req,res);if(!access)return;const {store,user}=access;
 try{
  if(req.method==='GET'){const {value}=await store.read();return res.json({data:visibleData(value),updated_at:new Date().toISOString(),source:'Private Vercel storage',limit:1000});}
  if(!['POST','PATCH'].includes(req.method))return res.status(405).end();
  if(JSON.stringify(req.body||{}).length>50000)return res.status(413).json({error:'Payload too large'});
  const {entity,id,version,values,kind}=req.body||{};
  if(!['members','records','memberships'].includes(entity))return res.status(400).json({error:'Invalid entity'});
  if(req.method==='POST'&&(id||version))return res.status(400).json({error:'New records cannot specify an ID or version'});
  if(req.method==='PATCH'&&(!/^[0-9a-f-]{36}$/i.test(id||'')||!Number.isInteger(version)||version<1))return res.status(400).json({error:'ID and version required'});
  let data;
  try{
   if(entity==='records'){if(!kinds.includes(kind))throw Error('Invalid record type');data={...validateRecord(values),kind};}
   else if(entity==='members')data=validateMember(values);
   else{if(!values||Object.keys(values).some(k=>!['member_id','project_id','status'].includes(k))||!['active','inactive'].includes(values.status)||!['member_id','project_id'].every(k=>/^[0-9a-f-]{36}$/i.test(values[k]||'')))throw Error('Invalid assignment');data=values;}
  }catch(e){return res.status(400).json({error:e.message});}
  const result=await store.change(state=>mutateState(state,{entity,id: id||null,version,values:data},user.id));
  return res.status(req.method==='POST'?201:200).json({data:result});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Private storage unavailable'});}
}
