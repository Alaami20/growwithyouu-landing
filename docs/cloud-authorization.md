# Cloud authorization and verification

No cloud resources, identities, roles, billing plans or security settings were changed.
The CEO approved a production code deployment on 8 November 2026. That approval
is not authorization to create IAM roles or grant new cloud access.

## Exact outstanding owner authorization

Authorize an existing read-only identity, or approve creation of the bounded
federated identities below. No passwords or administrator access keys are needed.
Once identities are authorized, the implementation can discover resources and
read billing; no names, tables or dashboard cards need manual entry.

### Microsoft Azure

Use an Entra single-tenant application with a federated credential:

- Issuer: `https://oidc.vercel.com/alaamiari-1018s-projects`
- Subject: `owner:alaamiari-1018s-projects:project:growwithyouu-landing:environment:production`
- Audience: `api://AzureADTokenExchange`
- Scope: only owner-approved subscriptions; Reader and Cost Management Reader.
- To read credit lots, separately authorize Billing Reader at the relevant MCA
  billing account/profile. Subscription Reader does not imply billing access.
- Server configuration: AZURE_TENANT_ID and AZURE_CLIENT_ID, Production only.
- No client secret is required. Do not grant data-plane access to prompts,
  customer tables, storage objects or Key Vault secrets.

The adapter reads ARM subscriptions, resource groups/resources, cost queries,
existing budgets, Cognitive Services deployment metadata, aggregate Azure Monitor
metrics and Consumption credit lots. ARM pagination is capped at five pages and
reported when partial; subscriptions/AI accounts/billing profiles are bounded.
MCA credit lots are not universally supported for every startup/sponsorship offer.
Unavailable entitlements retain the authoritative portal link and no fake balance.
Official references:
https://vercel.com/docs/oidc/azure
https://learn.microsoft.com/en-us/rest/api/consumption/lots/list-by-billing-profile?view=rest-consumption-2024-08-01

### AWS

Owner authorization is required for a Production-only Vercel OIDC trust and a
role restricted to `ops/cloud/aws-read-only-policy.json`. The trust template is
`ops/cloud/aws-trust-policy.example.json`; the account ID must be verified from
owner-authorized STS access, not inferred from historical notes. Confirm the
project's actual OIDC issuer mode before applying the trust. No policy has been
applied. Store the resulting existing role ARN in AWS_ROLE_ARN (server only).

Reads: caller account, enabled regions, EC2/S3/RDS/Lambda/ECS/EKS/Bedrock custom
models, tagged resources, CloudWatch alarms, existing budgets, billing credits
and credit allocation history. Inventory operations return a bounded first page
with explicit partial-collection errors. This is not exhaustive resource/service
health discovery; unsupported services and detailed Bedrock metrics remain
unavailable. No CloudWatch metric stream, paid monitor or health subscription is
created. AWS Health API integration is not implemented.

AWS Cost Explorer calls can incur charges, so AWS_COST_EXPLORER_APPROVED defaults
to false. Separate spending approval is required before setting it true. Only then
will service/record-type actual costs, cost forecasts and existing cost anomalies
be queried. The base read policy intentionally omits Cost Explorer permissions;
owner-approved `ce:GetCostAndUsage`, `ce:GetCostForecast`, `ce:GetAnomalies` would
also be needed. No enable/subscribe/modify API is called.
Official references:
https://vercel.com/docs/oidc/aws
https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_billing_GetCredits.html
https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_billing_GetCreditAllocationHistory.html
https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/

## Credits and allocation rules

Balances come only from provider entitlement responses. Credit lots retain
individual currencies and expiration dates; headline totals remain unavailable
rather than combining incompatible lots. Activated credits, program award, usage,
coverage and credit-exhaustion dates remain unavailable unless actually returned.
No advertised startup award is reduced by unrelated total costs. Azure and AWS
never share a balance. No exchange-rate conversion is performed.

Resource allocation uses explicit project/product/cost-center tags or audited
CEO overrides. Similar names are not ownership evidence. Shared percentages must
be explicitly set and total 100. Overrides do not modify provider tags/resources.
Current cost charts show provider actual rows; consolidated project/environment
cost rollups, monthly burn/exhaustion estimates and external notifications are
not implemented. On-screen credit-expiry, low-credit and existing-budget alerts
use only verified values. Missing values never mean zero or a healthy state.

## Integration blockers observed on 8 November 2026

The local environment has no Azure/AWS/Vercel credentials or CLI profiles. The
Vercel Production variable list contains only login/origin/email/private Blob
settings: no GitHub App, Azure identity or AWS role settings. No suitable connected
cloud billing app was discovered. Consequently live cloud connection, credit and
cost verification cannot truthfully pass yet. Unit tests use injected provider
responses and establish parser/security behavior, not real account connectivity.
