-- Apply with the Supabase SQL editor as the database owner. No production rows replaced.
begin;
create extension if not exists pgcrypto;
create table if not exists public.projects(id uuid primary key default gen_random_uuid(),name text not null unique,description text not null default '',created_at timestamptz not null default now());
create table if not exists public.members(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 160),role text not null default '',department text not null default '',status text not null default 'active' check(status in ('active','inactive')),manager_id uuid references public.members(id),github_username text,skills text not null default '',responsibilities text not null default '',start_date date,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.memberships(id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id),project_id uuid not null references public.projects(id),status text not null default 'active' check(status in ('active','inactive')),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(member_id,project_id));
-- Typed operational records share a lifecycle. Further domain normalization is required for provider sync.
create table if not exists public.records(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('tasks','milestones','sprints','campaigns','goals','releases','incidents','approvals','partnerships','investors','finance','mentorship','applications','updates')),title text not null check(length(title) between 1 and 240),project_id uuid references public.projects(id),owner_id uuid references public.members(id),reviewer_id uuid references public.members(id),status text not null default 'planned' check(status in ('planned','active','blocked','review','completed','inactive','approved','rejected')),priority text not null default 'P2' check(priority in ('P0','P1','P2','P3')),due_date date,start_date date,description text not null default '',acceptance_criteria text not null default '',evidence_url text,github_url text,source text not null default 'CEO entered',channel text,target text,amount numeric,currency text,financial_type text check(financial_type in ('actual','forecast','budget')),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists records_project_kind on public.records(project_id,kind,status);
create index if not exists records_owner_due on public.records(owner_id,due_date);
create index if not exists memberships_member on public.memberships(member_id);
create table if not exists public.audit_events(id uuid primary key default gen_random_uuid(),entity text not null,row_id uuid not null,actor_id uuid,action text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
create index if not exists audit_time on public.audit_events(created_at desc);
create table if not exists public.integration_status(id uuid primary key default gen_random_uuid(),name text not null unique,status text not null default 'Not connected',updated_at timestamptz,details text not null default '');
create table if not exists public.admin_rate_limits(subject uuid primary key,window_start timestamptz not null,hits integer not null);
create or replace function public.admin_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' then NEW.version=OLD.version+1;NEW.updated_at=now();end if;
 insert into public.audit_events(entity,row_id,actor_id,action,before_data,after_data) values(TG_TABLE_NAME,coalesce(NEW.id,OLD.id),nullif(current_setting('app.actor_id',true),'')::uuid,TG_OP,case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
 return NEW;
end;$$;
do $$declare t text;begin foreach t in array array['members','memberships','records'] loop execute format('drop trigger if exists audit_change on public.%I',t);execute format('create trigger audit_change before insert or update on public.%I for each row execute function public.admin_audit()',t);end loop;end;$$;
create or replace function public.admin_take_rate_limit(subject uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare count_hits integer;begin
 insert into public.admin_rate_limits values(subject,now(),1) on conflict on constraint admin_rate_limits_pkey do update set hits=case when admin_rate_limits.window_start<now()-interval '1 minute' then 1 else admin_rate_limits.hits+1 end,window_start=case when admin_rate_limits.window_start<now()-interval '1 minute' then now() else admin_rate_limits.window_start end returning hits into count_hits;
 return count_hits<=120;end;$$;
create or replace function public.admin_mutate(entity_name text,row_id uuid,expected_version integer,payload jsonb,actor_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed text[];cols text;vals text;assignments text;result jsonb;k text;begin
 if actor_id is null then raise exception 'actor required';end if;
 if entity_name='members' then allowed=array['name','role','department','status','manager_id','github_username','skills','responsibilities','start_date'];
 elsif entity_name='memberships' then allowed=array['member_id','project_id','status'];
 elsif entity_name='records' then allowed=array['kind','title','project_id','owner_id','reviewer_id','status','priority','due_date','start_date','description','acceptance_criteria','evidence_url','github_url','source','channel','target','amount','currency','financial_type'];
 else raise exception 'invalid entity';end if;
 for k in select jsonb_object_keys(payload) loop if not k=any(allowed) then raise exception 'invalid field';end if;end loop;
 perform set_config('app.actor_id',actor_id::text,true);
 select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',entity_name,key),','),string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,entity_name,key),',') into cols,vals,assignments from jsonb_object_keys(payload) as key;
 if row_id is null then execute format('insert into public.%I (%s) select %s returning to_jsonb(%I.*)',entity_name,cols,vals,entity_name) into result using payload;
 else execute format('update public.%I set %s where id=$2 and version=$3 returning to_jsonb(%I.*)',entity_name,assignments,entity_name) into result using payload,row_id,expected_version;
 if result is null then raise exception 'conflict';end if;end if;
 return result;end;$$;
-- Every table is closed to public clients. Only guarded server functions use service_role.
do $$declare t text;begin foreach t in array array['projects','members','memberships','records','audit_events','integration_status','admin_rate_limits'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);end loop;end;$$;
revoke all on function public.admin_audit() from public,anon,authenticated;
revoke all on function public.admin_mutate(text,uuid,integer,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.admin_take_rate_limit(uuid) from public,anon,authenticated;
grant execute on function public.admin_mutate(text,uuid,integer,jsonb,uuid) to service_role;
grant execute on function public.admin_take_rate_limit(uuid) to service_role;
insert into public.projects(name,description) values('GrowWithYouu','Company leadership and shared support'),('TripFly','AI travel platform'),('Crypora','Crypto intelligence and learning platform') on conflict(name) do nothing;
insert into public.integration_status(name) values('Google Drive recruitment'),('Website analytics'),('Billing'),('Travel providers'),('App Store Connect') on conflict(name) do nothing;
commit;
