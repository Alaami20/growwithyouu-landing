export function metrics(data,projectId,today=new Date().toISOString().slice(0,10)){
 const members=data.members.filter(m=>m.status==='active'&&(!projectId||data.memberships.some(a=>a.member_id===m.id&&a.project_id===projectId&&a.status==='active')));
 const records=data.records.filter(r=>!projectId||r.project_id===projectId);
 const tasks=records.filter(r=>r.kind==='tasks'&&r.status!=='inactive');
 return {members:members.length,tasks:tasks.length,open:tasks.filter(t=>!['completed','approved','rejected'].includes(t.status)).length,completed:tasks.filter(t=>t.status==='completed').length,overdue:tasks.filter(t=>t.due_date&&t.due_date<today&&!['completed','approved','rejected'].includes(t.status)).length,blocked:tasks.filter(t=>t.status==='blocked').length,approvals:records.filter(r=>r.kind==='approvals'&&['planned','review'].includes(r.status)).length};
}
