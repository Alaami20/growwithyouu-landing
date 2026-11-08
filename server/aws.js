import {ResourceGroupsTaggingAPIClient,GetResourcesCommand} from '@aws-sdk/client-resource-groups-tagging-api';
import {STSClient,GetCallerIdentityCommand} from '@aws-sdk/client-sts';
import {fromWebToken,fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {getVercelOidcToken} from '@vercel/oidc';
import {BillingClient,GetCreditsCommand,GetCreditAllocationHistoryCommand} from '@aws-sdk/client-billing';
import {CostExplorerClient,GetCostAndUsageCommand,GetCostForecastCommand,GetAnomaliesCommand} from '@aws-sdk/client-cost-explorer';
import {EC2Client,DescribeRegionsCommand,DescribeInstancesCommand} from '@aws-sdk/client-ec2';
import {S3Client,ListBucketsCommand} from '@aws-sdk/client-s3';
import {RDSClient,DescribeDBInstancesCommand} from '@aws-sdk/client-rds';
import {LambdaClient,ListFunctionsCommand} from '@aws-sdk/client-lambda';
import {ECSClient,ListClustersCommand} from '@aws-sdk/client-ecs';
import {EKSClient,ListClustersCommand as ListEKSClustersCommand} from '@aws-sdk/client-eks';
import {BedrockClient,ListCustomModelsCommand} from '@aws-sdk/client-bedrock';
import {CloudWatchClient,DescribeAlarmsCommand} from '@aws-sdk/client-cloudwatch';
import {BudgetsClient,DescribeBudgetsCommand} from '@aws-sdk/client-budgets';
import {unavailable,cloudError,verifiedAlerts} from './cloud-model.js';
export function awsCredits(data){return {status:'available',program:'AWS billing credits (Activate affiliation requires entitlement evidence)',source:'AWS Billing GetCredits',granted:null,used:null,remaining:null,expires_at:null,currency:null,billing_url:'https://console.aws.amazon.com/billing/home#/credits',items:(data.credits||[]).map(c=>({id:c.creditId,account:c.accountId,type:c.creditType,description:c.description,granted:c.initialAmount,remaining:c.remainingAmount,estimated_remaining:c.estimatedAmount,expires_at:c.endDate?.toISOString?.()||c.endDate||null,covered_services:c.applicableProductNames||[],source:'AWS Billing GetCredits'}))};}
export async function synchronizeAWS(env=process.env,transport){
 if(!transport&&!env.AWS_ROLE_ARN&&!env.AWS_ACCESS_KEY_ID&&!env.AWS_WEB_IDENTITY_TOKEN_FILE)return unavailable('aws','AWS read-only workload identity has not been authorized');
 const result=unavailable('aws','Billing authorization not available');result.errors=[];result.source='AWS APIs';result.regions=[];result.accounts=[];
 try{
 const credentials=!transport?(env.AWS_ROLE_ARN&&env.VERCEL?fromWebToken({roleArn:env.AWS_ROLE_ARN,webIdentityToken:await getVercelOidcToken(),roleSessionName:'GrowWithYouuReadOnly',durationSeconds:900}):fromNodeProviderChain()):null;
 const send=transport||((Client,Command,input,region='us-east-1')=>new Client({region,credentials,maxAttempts:2}).send(new Command(input),{abortSignal:AbortSignal.timeout(12000)}));
 const identity=await send(STSClient,GetCallerIdentityCommand,{});result.accounts=[{id:identity.Account}];const regions=await send(EC2Client,DescribeRegionsCommand,{});result.regions=(regions.Regions||[]).map(r=>r.RegionName);const selected=env.AWS_REGIONS?env.AWS_REGIONS.split(',').map(r=>r.trim()).filter(r=>result.regions.includes(r)):result.regions;
 const run=async(name,Client,Command,input,region,extract)=>{try{const r=await send(Client,Command,input,region);const rows=extract(r);result.resources.push(...rows.map(x=>({provider:'aws',account_id:identity.Account,region,...x})));if(r.NextToken||r.Marker||r.nextToken||r.PaginationToken||r.IsTruncated)result.errors.push({operation:name,region,error:'Partial collection: pagination limit reached'});}catch(e){result.errors.push({operation:name,region,error:cloudError(e)});}};
 await run('S3',S3Client,ListBucketsCommand,{MaxBuckets:1000},'us-east-1',r=>(r.Buckets||[]).map(b=>({id:'arn:aws:s3:::'+b.Name,name:b.Name,type:'S3',region:'Global'})));
 for(const region of selected){await Promise.all([
 run('Resource tags',ResourceGroupsTaggingAPIClient,GetResourcesCommand,{ResourcesPerPage:100},region,r=>(r.ResourceTagMappingList||[]).map(x=>({id:x.ResourceARN,name:x.ResourceARN.split('/').at(-1),type:'Tagged resource',tags:Object.fromEntries((x.Tags||[]).map(t=>[t.Key,t.Value]))}))),
 run('EC2',EC2Client,DescribeInstancesCommand,{MaxResults:100},region,r=>(r.Reservations||[]).flatMap(x=>x.Instances||[]).map(x=>({id:`arn:aws:ec2:${region}:${identity.Account}:instance/${x.InstanceId}`,name:x.InstanceId,type:'EC2',state:x.State?.Name,tags:Object.fromEntries((x.Tags||[]).map(t=>[t.Key,t.Value]))}))),
 run('RDS',RDSClient,DescribeDBInstancesCommand,{MaxRecords:100},region,r=>(r.DBInstances||[]).map(x=>({id:x.DBInstanceArn,name:x.DBInstanceIdentifier,type:'RDS',state:x.DBInstanceStatus}))),
 run('Lambda',LambdaClient,ListFunctionsCommand,{MaxItems:50},region,r=>(r.Functions||[]).map(x=>({id:x.FunctionArn,name:x.FunctionName,type:'Lambda'}))),
 run('ECS',ECSClient,ListClustersCommand,{maxResults:100},region,r=>(r.clusterArns||[]).map(id=>({id,name:id.split('/').at(-1),type:'ECS'}))),
 run('EKS',EKSClient,ListEKSClustersCommand,{maxResults:100},region,r=>(r.clusters||[]).map(name=>({id:`arn:aws:eks:${region}:${identity.Account}:cluster/${name}`,name,type:'EKS'}))),
 run('Bedrock',BedrockClient,ListCustomModelsCommand,{maxResults:100},region,r=>(r.modelSummaries||[]).map(x=>({id:x.modelArn,name:x.modelName,type:'Bedrock custom model'}))),
 run('CloudWatch alarms',CloudWatchClient,DescribeAlarmsCommand,{MaxRecords:100},region,r=>(r.MetricAlarms||[]).map(x=>({id:x.AlarmArn,name:x.AlarmName,type:'CloudWatch alarm',state:x.StateValue})))
 ]);}
 try{const now=new Date(),start=new Date(now.getTime()-364*86400000);result.credits=awsCredits(await send(BillingClient,GetCreditsCommand,{accountId:identity.Account,startDate:start,endDate:now}));}catch(e){result.credits.reason=cloudError(e);}
 const byId=new Map();for(const r of result.resources){const existing=byId.get(r.id);byId.set(r.id,existing?{...existing,...r,tags:{...existing.tags,...r.tags},type:r.type==='Tagged resource'?existing.type:r.type}:r);}result.resources=[...byId.values()];
 try{const h=await send(BillingClient,GetCreditAllocationHistoryCommand,{accountId:identity.Account,startDate:new Date(Date.now()-90*86400000),endDate:new Date(),maxResults:100});result.credits.history={items:h.creditAllocationHistoryList||[],truncated:!!h.nextToken,partial:!!h.partialResults,failed_months:h.failedMonths||[],source:'AWS Billing GetCreditAllocationHistory'};}catch(e){result.errors.push({operation:'credit history',error:cloudError(e)});}
 try{const b=await send(BudgetsClient,DescribeBudgetsCommand,{AccountId:identity.Account,MaxResults:100});result.budgets={source:'AWS Budgets',items:(b.Budgets||[]).map(x=>({name:x.BudgetName,limit:Number(x.BudgetLimit?.Amount),actual:Number(x.CalculatedSpend?.ActualSpend?.Amount),currency:x.BudgetLimit?.Unit,source:'AWS Budgets'})),truncated:!!b.NextToken};}catch(e){result.errors.push({operation:'budgets',error:cloudError(e)});}
 // Cost Explorer API requests may be billed. Never enable them by default.
 if(env.AWS_COST_EXPLORER_APPROVED==='true'){const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-2,1)).toISOString().slice(0,10),end=now.toISOString().slice(0,10);try{const c=await send(CostExplorerClient,GetCostAndUsageCommand,{TimePeriod:{Start:start,End:end},Granularity:'MONTHLY',Metrics:['UnblendedCost'],GroupBy:[{Type:'DIMENSION',Key:'SERVICE'},{Type:'DIMENSION',Key:'RECORD_TYPE'}]});result.costs={status:'available',source:'AWS Cost Explorer',months:c.ResultsByTime,truncated:!!c.NextPageToken};}catch(e){result.errors.push({operation:'costs',error:cloudError(e)});}try{const last=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);result.forecast={source:'AWS Cost Explorer forecast',...(await send(CostExplorerClient,GetCostForecastCommand,{TimePeriod:{Start:end,End:last},Metric:'UNBLENDED_COST',Granularity:'MONTHLY'}))};}catch(e){result.errors.push({operation:'forecast',error:cloudError(e)});}try{const a=await send(CostExplorerClient,GetAnomaliesCommand,{DateInterval:{StartDate:start,EndDate:end},MaxResults:100});result.anomalies=(a.Anomalies||[]).map(x=>({id:x.AnomalyId,date:x.AnomalyStartDate,impact:x.Impact,source:'AWS Cost Anomaly Detection'}));}catch(e){result.errors.push({operation:'anomalies',error:cloudError(e)});}}
 else result.costs={status:'unavailable',reason:'Cost Explorer API request charges have not been approved; no billed requests made',source:'AWS Cost Explorer'};
 result.status=result.errors.length?'partial':'connected';result.last_synced=new Date().toISOString();result.alerts=verifiedAlerts(result);return result;
 }catch(e){return {...result,status:'unavailable',reason:cloudError(e),last_attempted:new Date().toISOString()};}
}
