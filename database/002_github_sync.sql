begin;
create table if not exists public.github_jobs(id uuid primary key default gen_random_uuid(),delivery_id text not null unique,repository text not null,event_type text not null,status text not null default 'pending' check(status in ('pending','processing','completed','failed')),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),locked_at timestamptz,last_error text,created_at timestamptz not null default now());
create index if not exists github_jobs_pending on public.github_jobs(status,next_attempt_at);
create table if not exists public.github_snapshots(id uuid primary key default gen_random_uuid(),repository text not null unique,snapshot jsonb not null,updated_at timestamptz not null);
alter table public.github_jobs enable row level security;
alter table public.github_snapshots enable row level security;
revoke all on public.github_jobs,public.github_snapshots from anon,authenticated;
create or replace function public.admin_claim_github_job() returns setof public.github_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin return query update public.github_jobs set status='processing',attempts=attempts+1,locked_at=now() where id=(select id from public.github_jobs where (status='pending' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes') order by created_at for update skip locked limit 1) returning *;end;$$;
revoke all on function public.admin_claim_github_job() from public,anon,authenticated;
grant execute on function public.admin_claim_github_job() to service_role;
commit;
