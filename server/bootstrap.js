import {githubRequest,repositoryMap} from './github.js';
import {importCompany} from './import.js';
export const SOURCE={repository:'Alaami20/Crypto-Intel',ref:'65a6f05c3fcc4ab26ff9f1ea43491b2e35c2079d',path:'ops/ceo/company-directory.json'};
export async function bootstrapCompany(store,actor,request=githubRequest,env=process.env){
 const {value}=await store.read();if(value.company_bootstrap?.ref===SOURCE.ref)return value.company_bootstrap;
 if(!env.GITHUB_APP_ID||!env.GITHUB_APP_PRIVATE_KEY||!env.GITHUB_INSTALLATION_ID||!Object.hasOwn(repositoryMap(env),SOURCE.repository))return {status:'blocked',reason:'Private source repository read authorization is required',source:SOURCE.repository,ref:SOURCE.ref};
 const response=await request(SOURCE.repository,'contents/'+SOURCE.path+'?ref='+SOURCE.ref);if(response.data.encoding!=='base64'||response.data.size>200000)throw Error('Invalid private source manifest');const manifest=JSON.parse(Buffer.from(response.data.content,'base64').toString('utf8'));
 return store.change(state=>{if(state.company_bootstrap?.ref===SOURCE.ref)return state.company_bootstrap;const result=importCompany(state,manifest,actor);state.company_bootstrap={status:'imported',ref:SOURCE.ref,source:SOURCE.repository,result,at:new Date().toISOString()};return state.company_bootstrap;});
}
