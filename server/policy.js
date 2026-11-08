export const kinds = ['tasks','milestones','sprints','campaigns','goals','releases','incidents','approvals','partnerships','investors','finance','mentorship','applications','updates'];
export const CEO_EMAIL = 'alaamiari@growwithyouu.com';
export function authorize(user, token, env) {
  if (!env.CEO_USER_ID || env.CEO_VERIFIED_EMAIL?.toLowerCase() !== CEO_EMAIL) return false;
  if (!user || user.id !== env.CEO_USER_ID || !user.email_confirmed_at || user.email?.toLowerCase() !== env.CEO_VERIFIED_EMAIL.toLowerCase()) return false;
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).aal === 'aal2'; } catch { return false; }
}
const statuses = ['planned','active','blocked','review','completed','inactive','approved','rejected'];
export function validateRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Object required');
  const allowed = ['title','project_id','owner_id','reviewer_id','status','priority','due_date','description','acceptance_criteria','evidence_url','amount','currency','financial_type','source','github_url','channel','target','start_date'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw Error('Unsupported field');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 240) throw Error('Title required (maximum 240 characters)');
  if (!statuses.includes(input.status)) throw Error('Invalid status');
  if (!['P0','P1','P2','P3'].includes(input.priority)) throw Error('Invalid priority');
  for (const key of ['project_id','owner_id','reviewer_id']) if(input[key] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input[key])) throw Error('Invalid reference');
  for (const key of ['description','acceptance_criteria','source','channel','target']) if(input[key] != null && (typeof input[key] !== 'string' || input[key].length > 10000)) throw Error('Invalid text');
  for (const key of ['due_date','start_date']) if(input[key] && !/^\d{4}-\d{2}-\d{2}$/.test(input[key])) throw Error('Invalid date');
  for (const key of ['evidence_url','github_url']) if(input[key]) { let url; try {url = new URL(input[key]);}catch{throw Error('Invalid URL');} if(url.protocol!=='https:') throw Error('HTTPS URLs required'); }
  if(input.amount != null && (!Number.isFinite(input.amount) || Math.abs(input.amount)>1e12)) throw Error('Invalid amount');
  if(input.currency && !/^[A-Z]{3}$/.test(input.currency)) throw Error('Invalid currency');
  if(input.financial_type && !['actual','forecast','budget'].includes(input.financial_type)) throw Error('Invalid financial type');
  return {...input,title:input.title.trim()};
}
export function validateMember(input) {
  const fields = ['name','role','department','status','manager_id','github_username','skills','responsibilities','start_date'];
  if (!input || Object.keys(input).some(k => !fields.includes(k))) throw Error('Unsupported field');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>160) throw Error('Name required');
  for(const k of ['role','department','skills','responsibilities']) if(input[k]!=null&&(typeof input[k]!=='string'||input[k].length>5000)) throw Error('Invalid text');
  if(!['active','inactive'].includes(input.status)) throw Error('Invalid member status');
  if(input.manager_id && !/^[0-9a-f-]{36}$/i.test(input.manager_id)) throw Error('Invalid manager');
  if(input.github_username && !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(input.github_username)) throw Error('Invalid GitHub username');
  if(input.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) throw Error('Invalid date');
  return {...input,name:input.name.trim()};
}
export function safeError(error) { return error?.code === '23505' ? 'Record already exists' : 'Operation failed. Check the server configuration or referenced records.'; }
