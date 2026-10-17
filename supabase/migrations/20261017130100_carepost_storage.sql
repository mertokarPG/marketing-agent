insert into storage.buckets (id, name, public) values
  ('brand-assets', 'brand-assets', false),
  ('post-media', 'post-media', false)
on conflict (id) do nothing;

drop policy if exists "carepost members read" on storage.objects;
create policy "carepost members read" on storage.objects for select to authenticated
  using (
    bucket_id in ('brand-assets', 'post-media')
    and public.is_brand_member(public.try_uuid((storage.foldername(name))[1]))
  );
