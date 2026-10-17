-- Carepost foundation: multi-tenant brands, drafts, runs. Writes are service-role only.

create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$ begin return t::uuid; exception when others then return null; end $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  domain text not null default '',
  niche text not null default '',
  description text not null default '',
  tone text not null default '',
  keywords text[] not null default '{}',
  competitors jsonb not null default '[]',
  instagram_handle text,
  design_system text,
  prompt_bank_path text,
  branding jsonb,
  carousel jsonb,
  hot_topics jsonb,
  image_generation jsonb,
  posting_schedule jsonb not null default '{"coreDays":["mon","tue","wed","thu","fri"],"defaultTime":"10:00"}',
  timezone text not null default 'Europe/Brussels',
  approval_mode text not null default 'review' check (approval_mode in ('review','autopilot')),
  status text not null default 'active' check (status in ('active','paused')),
  publisher text check (publisher in ('postiz')),
  created_at timestamptz not null default now()
);

create table if not exists public.brand_members (
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('logo','font','icon','product')),
  storage_path text not null unique,
  label text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.brand_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source jsonb not null
);

create table if not exists public.trends (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_id text not null,
  category text not null,
  title text not null,
  url text not null,
  summary text,
  published_at timestamptz,
  score integer,
  fetched_at timestamptz not null default now(),
  unique (brand_id, url)
);
create index if not exists trends_brand_fetched on public.trends (brand_id, fetched_at);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('weekly_plan','daily_check','manual')),
  period_key text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  summary text,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  image_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (brand_id, kind, period_key)
);
create index if not exists agent_runs_queue on public.agent_runs (status, created_at);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  kind text not null check (kind in ('core','timely')),
  status text not null check (status in ('pending_approval','approved','publishing','published','failed','rejected','expired')),
  planned_at timestamptz not null,
  caption text not null,
  hashtags text[] not null default '{}',
  media jsonb not null default '[]',
  prompt_ids text[] not null default '{}',
  rationale text not null default '',
  external_post_id text,
  published_at timestamptz,
  publish_error text,
  is_outlier boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_brand_planned on public.posts (brand_id, planned_at);
create index if not exists posts_due on public.posts (status, planned_at);
drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();

create table if not exists public.post_metrics (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  likes integer not null default 0, comments integer not null default 0, shares integer not null default 0,
  reach integer not null default 0, impressions integer not null default 0, views integer not null default 0,
  saves integer not null default 0, profile_visits integer not null default 0, link_clicks integer not null default 0,
  measured_at timestamptz not null default now()
);

create table if not exists public.competitor_snapshots (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  competitor_name text not null,
  content_summary text,
  engagement_notes text,
  scraped_at timestamptz not null default now()
);

-- Membership check used by every policy. SECURITY DEFINER so it can read brand_members under RLS.
create or replace function public.is_brand_member(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brand_members where brand_id = p_brand_id and user_id = auth.uid())
$$;
revoke all on function public.is_brand_member(uuid) from public, anon;
grant execute on function public.is_brand_member(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['brands','brand_members','brand_assets','brand_sources','trends','agent_runs','posts','post_metrics','competitor_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists brands_select_member on public.brands;
create policy brands_select_member on public.brands for select to authenticated using (public.is_brand_member(id));

drop policy if exists brand_members_select on public.brand_members;
create policy brand_members_select on public.brand_members for select to authenticated
  using (user_id = auth.uid() or public.is_brand_member(brand_id));

do $$
declare t text;
begin
  foreach t in array array['brand_assets','brand_sources','trends','agent_runs','posts','post_metrics','competitor_snapshots'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_brand_member(brand_id))', t || '_select_member', t);
  end loop;
end $$;
