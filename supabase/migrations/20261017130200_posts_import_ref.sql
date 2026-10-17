-- Stable reference for rows imported from the legacy SQLite DB (e.g. 'sqlite:12'); makes the one-off import idempotent.
alter table public.posts add column if not exists import_ref text;
create unique index if not exists posts_brand_import_ref on public.posts (brand_id, import_ref) where import_ref is not null;
