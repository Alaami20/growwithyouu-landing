import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifySignature,repositoryMap,summarizeRepository} from '../server/github.js';
test('webhooks require an exact signature over the unmodified body',()=>{
 const body=Buffer.from('{"action":"closed"}'),secret='test-secret';
 const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
 assert.equal(verifySignature(body,signature,secret),true);
 assert.equal(verifySignature(Buffer.from('{}'),signature,secret),false);
 for(const value of ['',null,'sha256=bad',signature+'a'])assert.equal(verifySignature(body,value,secret),false);
 assert.equal(verifySignature(body,signature,''),false);
});
test('repository configuration rejects unknown projects and malformed repository names',()=>{
 assert.deepEqual(repositoryMap({GITHUB_PROJECT_MAP:'invalid'}),{});
 assert.deepEqual(repositoryMap({GITHUB_PROJECT_MAP:JSON.stringify({'owner/tripfly':'TripFly','owner/crypto':'Crypora','../bad':'TripFly','owner/other':'Unknown'})}),{'owner/tripfly':'TripFly','owner/crypto':'Crypora'});
});
test('activity deduplicates SHAs, excludes bots and separates closed from merged PRs',()=>{
 const person={login:'alice',type:'User'},bot={login:'robot',type:'Bot'};
 const commit={sha:'one',author:person,html_url:'https://example.test/one',commit:{message:'Implement planner\nDetails'}};
 const result=summarizeRepository({commits:{items:[commit,commit,{...commit,sha:'bot',author:bot},{...commit,sha:'unknown',author:null}]},pulls:{items:[{number:1,state:'closed',merged_at:'2026-11-08',user:person},{number:2,state:'closed',merged_at:null,user:person},{number:3,state:'open',user:bot}]},issues:{items:[{state:'closed',assignees:[person]},{state:'open'},{state:'open',pull_request:{}}]}});
 assert.equal(result.unique_commit_shas,3);assert.equal(result.open_prs,1);assert.equal(result.merged_prs,1);assert.equal(result.closed_prs,1);assert.equal(result.open_issues,1);
 assert.equal(result.contributors.length,1);assert.equal(result.contributors[0].commits,1);assert.equal(result.contributors[0].authored_prs,2);assert.equal(result.contributors[0].issues_closed,1);
});
