import {createSign,createHmac,timingSafeEqual} from 'node:crypto';
let installationToken;
export function repositoryMap(env=process.env){try{const map=JSON.parse(env.GITHUB_PROJECT_MAP||'{}');return Object.fromEntries(Object.entries(map).filter(([repo,project])=>/^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9_.-]+$/i.test(repo)&&!repo.split('/').some(part=>part==='.'||part==='..')&&['GrowWithYouu','TripFly','Crypora'].includes(project)));}catch{return {};}}
export function verifySignature(raw,signature,secret){if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}
export async function githubToken(){
 const {GITHUB_APP_ID:id,GITHUB_APP_PRIVATE_KEY:key,GITHUB_INSTALLATION_ID:installation}=process.env;
 if(!id||!key||!installation)throw Error('GitHub App not configured');
 if(installationToken?.expires>Date.now()+60000)return installationToken.value;
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const header=enc({alg:'RS256',typ:'JWT'}),body=enc({iat:now-60,exp:now+540,iss:id}),unsigned=header+'.'+body;
 const sign=createSign('RSA-SHA256');sign.update(unsigned);const jwt=unsigned+'.'+sign.sign(key.replaceAll('\\n','\n'),'base64url');
 const r=await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installation)}/access_tokens`,{method:'POST',headers:{Authorization:'Bearer '+jwt,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('GitHub App authorization failed');const token=await r.json();installationToken={value:token.token,expires:Date.parse(token.expires_at)};return token.token;
}
export async function githubRequest(repo,path,options={}){
 if(!Object.hasOwn(repositoryMap(),repo))throw Error('Repository not authorized');
 if(!/^[\w/?=&.%+,-]*$/.test(path)||path.includes('..'))throw Error('Invalid GitHub path');
 const token=await githubToken(),r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{...options,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(12000)});
 if(!r.ok){const e=Error(r.status===403||r.status===429?'GitHub permission or rate limit':'GitHub request failed');e.status=r.status;e.retryAfter=r.headers.get('retry-after');throw e;}return {data:await r.json(),next:r.headers.get('link')?.includes('rel="next"')||false};
}
export async function listGithub(repo,path,{maxPages=3,key=null}={}){
 const all=[];let truncated=false;
 for(let page=1;page<=maxPages;page++){const r=await githubRequest(repo,path+(path.includes('?')?'&':'?')+'per_page=100&page='+page);all.push(...(key?r.data[key]:r.data));if(!r.next)break;if(page===maxPages)truncated=true;}
 return {items:all,truncated,maxPages};
}
export function summarizeRepository(snapshot){
 const pulls=snapshot.pulls.items,issues=snapshot.issues.items.filter(x=>!x.pull_request),commits=[...new Map(snapshot.commits.items.map(c=>[c.sha,c])).values()];
 const contributors=new Map();
 const person=login=>{if(!contributors.has(login))contributors.set(login,{login,commits:0,authored_prs:0,merged_prs:0,issues_closed:0,evidence:[]});return contributors.get(login);};
 for(const c of commits){if(!c.author?.login||c.author.type==='Bot')continue;const p=person(c.author.login);p.commits++;if(p.evidence.length<10)p.evidence.push({type:'commit',url:c.html_url,title:c.commit.message.split('\n')[0]});}
 for(const p of pulls){if(!p.user?.login||p.user.type==='Bot')continue;const c=person(p.user.login);c.authored_prs++;if(p.merged_at)c.merged_prs++;if(c.evidence.length<10)c.evidence.push({type:'pull request',url:p.html_url,title:p.title});}
 for(const i of issues){if(i.state==='closed')for(const a of i.assignees||[])if(a.type!=='Bot')person(a.login).issues_closed++;}
 return {open_prs:pulls.filter(p=>p.state==='open').length,merged_prs:pulls.filter(p=>p.merged_at).length,closed_prs:pulls.filter(p=>p.state==='closed'&&!p.merged_at).length,open_issues:issues.filter(i=>i.state==='open').length,closed_issues:issues.filter(i=>i.state==='closed').length,unique_commit_shas:commits.length,contributors:[...contributors.values()],coverage:'Counts describe the fetched sample and reporting window, not all-time totals. Squashed commits, renamed accounts and unattributed commits are not guessed. Issue credit describes assigned users, not proven implementation authors.'};
}
export async function snapshotRepository(repo){
 const since=new Date(Date.now()-30*86400000).toISOString();
 const [metadata,pulls,issues,commits,branches,workflows,releases]=await Promise.all([githubRequest(repo,''),listGithub(repo,'pulls?state=all&sort=updated&direction=desc'),listGithub(repo,'issues?state=all&sort=updated&direction=desc'),listGithub(repo,'commits?since='+encodeURIComponent(since)),listGithub(repo,'branches'),listGithub(repo,'actions/runs', {maxPages:1,key:'workflow_runs'}),listGithub(repo,'releases',{maxPages:1})]);
 const optional=async path=>{try{return {status:'available',...(await githubRequest(repo,path))};}catch(e){return {status:e.status===404?'Unavailable or not configured':'Permission unavailable',data:null};}};
 const [protection,security]=await Promise.all([optional('branches/'+encodeURIComponent(metadata.data.default_branch)+'/protection'),optional('dependabot/alerts?state=open&per_page=100')]);
 const snapshot={repo,project:repositoryMap()[repo],metadata:{name:metadata.data.full_name,url:metadata.data.html_url,default_branch:metadata.data.default_branch,private:metadata.data.private,pushed_at:metadata.data.pushed_at},pulls,issues,commits,branches,workflows,releases,protection,security,period:{commits_since:since,other_data:'Recent fetched records, capped at 300 per collection'},updated_at:new Date().toISOString()};
 return {...snapshot,summary:summarizeRepository(snapshot)};
}
