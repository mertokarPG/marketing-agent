-- Dashboard: reworking status, revise runs, post versions/revisions, weekly brand insights.
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('pending_approval','approved','publishing','published','failed','rejected','expired','reworking'));
alter table public.posts add column if not exists needs_new_time boolean not null default false;
alter table public.posts add column if not exists last_changed_by uuid references auth.users(id);
alter table public.posts add column if not exists last_changed_at timestamptz;

alter table public.agent_runs drop constraint if exists agent_runs_kind_check;
alter table public.agent_runs add constraint agent_runs_kind_check
  check (kind in ('weekly_plan','daily_check','manual','revise'));

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  caption text not null,
  hashtags text[] not null,
  media jsonb not null,
  planned_at timestamptz not null,
  reason text not null check (reason in ('redo','restore')),
  feedback text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists post_versions_post on public.post_versions (post_id, created_at);

create table if not exists public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  requested_by uuid not null,
  feedback text not null,
  prior_status text not null,
  version_id uuid not null references public.post_versions(id),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists post_revisions_post on public.post_revisions (post_id, created_at);

create table if not exists public.brand_insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  week_key text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (brand_id, week_key)
);

do $$
declare t text;
begin
  foreach t in array array['post_versions','post_revisions','brand_insights'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_brand_member(brand_id))', t || '_select_member', t);
  end loop;
end $$;
