import {mutateState,StoreError} from './store.js';
import {validateMember,validateRecord} from './policy.js';
const normalize=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export function importCompany(state,manifest,actor){
 if(!manifest||!Array.isArray(manifest.members)||manifest.members.length>200||!Array.isArray(manifest.sources)||!manifest.sources.length)throw new StoreError('Verified sources and a bounded member list are required',400);
 const result={created:0,preserved:0,assignments:0,records:0,conflicts:[],unique_members:0},known=new Map(),source=manifest.sources.map(s=>String(s).slice(0,300)).join('; ');
 const seen=new Set(),names=new Set();
 for(const input of manifest.members){
  if(!input.key||seen.has(input.key))throw new StoreError('Duplicate source identity',400);seen.add(input.key);
  const values=validateMember(input.values);if(names.has(normalize(values.name)))throw new StoreError('Duplicate name in source manifest requires explicit identity review',409);names.add(normalize(values.name));const matches=state.members.filter(m=>normalize(m.name)===normalize(values.name));
  if(matches.length>1)throw new StoreError('Ambiguous existing member; import was not applied',409);
  let row=matches[0];
  if(row){result.preserved++;for(const [field,value] of Object.entries(values))if(value&&row[field]&&row[field]!==value)result.conflicts.push({member:row.name,field,current:row[field],source:value});const fill=Object.fromEntries(Object.entries(values).filter(([key,value])=>value&&!row[key]&&key!=='status'));if(Object.keys(fill).length)row=mutateState(state,{entity:'members',id:row.id,version:row.version,values:fill},actor);}
  else{row=mutateState(state,{entity:'members',values},actor);result.created++;}
  known.set(input.key,row);
 }
 for(const input of manifest.members){const row=known.get(input.key);if(input.manager_key){const manager=known.get(input.manager_key);if(!manager)throw new StoreError('Unknown source manager',400);if(row.manager_id&&row.manager_id!==manager.id)result.conflicts.push({member:row.name,field:'manager_id'});else if(!row.manager_id)mutateState(state,{entity:'members',id:row.id,version:row.version,values:{manager_id:manager.id}},actor);}
  for(const name of input.projects||[]){const project=state.projects.find(p=>p.name===name);if(!project)throw new StoreError('Unknown source project',400);if(!state.memberships.some(a=>a.member_id===row.id&&a.project_id===project.id)){mutateState(state,{entity:'memberships',values:{member_id:row.id,project_id:project.id,status:'active'}},actor);result.assignments++;}}
 }
 for(const item of manifest.records||[]){if(!item.source_key||!['milestones','mentorship'].includes(item.kind))throw new StoreError('Invalid imported record',400);const title=String(item.values?.title||'');if(state.records.some(r=>r.source===source+' #'+item.source_key))continue;const values=validateRecord({...item.values,title,source:source+' #'+item.source_key,owner_id:item.owner_key?known.get(item.owner_key)?.id:null,reviewer_id:item.reviewer_key?known.get(item.reviewer_key)?.id:null,project_id:state.projects.find(p=>p.name===item.project)?.id||null});if(item.owner_key&&!values.owner_id||item.reviewer_key&&!values.reviewer_id)throw new StoreError('Unknown relationship identity',400);mutateState(state,{entity:'records',values:{...values,kind:item.kind}},actor);result.records++;}
 if(manifest.github_snapshots){
  if(!Array.isArray(manifest.github_snapshots)||manifest.github_snapshots.length>20)throw new StoreError('Invalid repository snapshots',400);
  state.github_repository_map||={};
  for(const snapshot of manifest.github_snapshots){if(!/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i.test(snapshot.repo||'')||!['GrowWithYouu','TripFly','Crypora'].includes(snapshot.project)||!snapshot.updated_at||!snapshot.summary)throw new StoreError('Invalid repository evidence',400);state.github_repository_map[snapshot.repo]=snapshot.project;if(!state.github_snapshots.some(r=>r.repository===snapshot.repo))state.github_snapshots.push({repository:snapshot.repo,snapshot,updated_at:snapshot.updated_at,source:'Authorized GitHub connector bootstrap'});}
 }
 state.import_history||=[];state.import_history.push({sources:manifest.sources,at:new Date().toISOString(),actor,result});result.unique_members=state.members.length;return result;
}
