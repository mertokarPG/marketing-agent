-- Dashboard write RPCs. RLS lets members SELECT only, so these SECURITY DEFINER functions are the
-- only way a web user changes data. Each one locks the post row, then checks the caller is an
-- owner/editor of that post's brand and that the post is editable, and raises 'carepost:<code>'.
-- Codes: not_allowed, not_found, not_editable, reworking, in_past, needs_new_time, caption_too_long,
-- invalid_media, redo_limit, too_close, paused, invalid_input.

-- Internal: lock a post, check the caller's role and that the post is editable. Not callable by clients.
create or replace function public._carepost_lock_post(p_post uuid) returns public.posts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post public.posts;
  v_uid uuid := auth.uid();
begin
  if p_post is null then raise exception 'carepost:not_found'; end if;
  select * into v_post from public.posts where id = p_post for update;
  if not found then raise exception 'carepost:not_found'; end if;
  -- Role is checked after the lock, against the locked row's brand.
  if v_uid is null or not exists (
    select 1 from public.brand_members m
    where m.brand_id = v_post.brand_id and m.user_id = v_uid and m.role in ('owner','editor')
  ) then
    raise exception 'carepost:not_allowed';
  end if;
  if v_post.status = 'reworking' then raise exception 'carepost:reworking'; end if;
  if v_post.status not in ('pending_approval','approved') then raise exception 'carepost:not_editable'; end if;
  return v_post;
end $$;

create or replace function public.approve_post(p_post uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post public.posts;
begin
  v_post := public._carepost_lock_post(p_post);
  if v_post.status = 'approved' then return; end if;
  if v_post.needs_new_time then raise exception 'carepost:needs_new_time'; end if;
  if v_post.planned_at <= now() then raise exception 'carepost:in_past'; end if;
  update public.posts set status = 'approved', last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.unapprove_post(p_post uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post public.posts;
begin
  v_post := public._carepost_lock_post(p_post);
  if v_post.status = 'pending_approval' then return; end if;
  update public.posts set status = 'pending_approval', last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.skip_post(p_post uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post public.posts;
begin
  v_post := public._carepost_lock_post(p_post);
  update public.posts set status = 'rejected', last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.update_post_caption(p_post uuid, p_caption text, p_hashtags text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post public.posts;
  v_tags text[] := coalesce(p_hashtags, '{}');
begin
  v_post := public._carepost_lock_post(p_post);
  if p_caption is null or btrim(p_caption) = '' then raise exception 'carepost:invalid_input'; end if;
  if char_length(p_caption) > 2200 then raise exception 'carepost:caption_too_long'; end if;
  if cardinality(v_tags) > 30
     or array_position(v_tags, null) is not null
     or exists (select 1 from unnest(v_tags) t where char_length(t) > 100 or btrim(t) = '') then
    raise exception 'carepost:invalid_input';
  end if;
  update public.posts set caption = p_caption, hashtags = v_tags, last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.reschedule_post(p_post uuid, p_planned_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post public.posts;
begin
  v_post := public._carepost_lock_post(p_post);
  if p_planned_at is null or p_planned_at <= now() then raise exception 'carepost:in_past'; end if;
  update public.posts set planned_at = p_planned_at, needs_new_time = false,
    last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.update_post_media(p_post uuid, p_media jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post public.posts;
  v_item jsonb;
  v_path text;
  v_bucket text;
  v_prefix text;
begin
  v_post := public._carepost_lock_post(p_post);
  if p_media is null or jsonb_typeof(p_media) <> 'array'
     or jsonb_array_length(p_media) < 1 or jsonb_array_length(p_media) > 10 then
    raise exception 'carepost:invalid_media';
  end if;
  v_prefix := v_post.brand_id::text || '/' || v_post.id::text || '/';
  for v_item in select value from jsonb_array_elements(p_media) loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('storage_path','bucket','width','height'))
       or jsonb_typeof(v_item->'storage_path') is distinct from 'string'
       or (v_item ? 'bucket' and jsonb_typeof(v_item->'bucket') not in ('string','null'))
       or (v_item ? 'width' and jsonb_typeof(v_item->'width') <> 'number')
       or (v_item ? 'height' and jsonb_typeof(v_item->'height') <> 'number') then
      raise exception 'carepost:invalid_media';
    end if;
    v_path := v_item->>'storage_path';
    v_bucket := coalesce(v_item->>'bucket', 'post-media');
    if v_path like '%..%' or v_path like '%\\%' or v_path like '/%' or v_path like '%//%' then
      raise exception 'carepost:invalid_media';
    end if;
    if v_bucket = 'post-media' then
      if left(v_path, char_length(v_prefix)) <> v_prefix or char_length(v_path) = char_length(v_prefix) then
        raise exception 'carepost:invalid_media';
      end if;
    elsif v_bucket = 'brand-assets' then
      if not exists (
        select 1 from public.brand_assets a
        where a.brand_id = v_post.brand_id and a.kind = 'product' and a.storage_path = v_path
      ) then
        raise exception 'carepost:invalid_media';
      end if;
    else
      raise exception 'carepost:invalid_media';
    end if;
  end loop;
  update public.posts set media = p_media, last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;
end $$;

create or replace function public.request_post_redo(p_post uuid, p_feedback text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post public.posts;
  v_feedback text := btrim(coalesce(p_feedback, ''));
  v_version uuid;
  v_revision uuid;
begin
  v_post := public._carepost_lock_post(p_post);
  if (select b.status from public.brands b where b.id = v_post.brand_id) = 'paused' then
    raise exception 'carepost:paused';
  end if;
  if char_length(v_feedback) < 1 or char_length(v_feedback) > 500 then raise exception 'carepost:invalid_input'; end if;
  if v_post.planned_at - now() < interval '30 minutes' then raise exception 'carepost:too_close'; end if;
  if (select count(*) from public.post_revisions r where r.post_id = v_post.id and r.status <> 'failed') >= 3 then
    raise exception 'carepost:redo_limit';
  end if;

  insert into public.post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason, feedback, created_by)
  values (v_post.id, v_post.brand_id, v_post.caption, v_post.hashtags, v_post.media, v_post.planned_at, 'redo', v_feedback, auth.uid())
  returning id into v_version;

  insert into public.post_revisions (post_id, brand_id, requested_by, feedback, prior_status, version_id)
  values (v_post.id, v_post.brand_id, auth.uid(), v_feedback, v_post.status, v_version)
  returning id into v_revision;

  update public.posts set status = 'reworking', last_changed_by = auth.uid(), last_changed_at = now()
  where id = v_post.id;

  insert into public.agent_runs (brand_id, kind, period_key) values (v_post.brand_id, 'revise', v_revision::text);
  return v_revision;
end $$;

create or replace function public.restore_post_version(p_version uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version public.post_versions;
  v_post public.posts;
begin
  if p_version is null then raise exception 'carepost:not_found'; end if;
  select * into v_version from public.post_versions where id = p_version;
  if not found then raise exception 'carepost:not_found'; end if;
  -- The post (and so the brand whose membership is checked) is derived from the version row.
  v_post := public._carepost_lock_post(v_version.post_id);

  insert into public.post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason, created_by)
  values (v_post.id, v_post.brand_id, v_post.caption, v_post.hashtags, v_post.media, v_post.planned_at, 'restore', auth.uid());

  -- A version's time that has already passed is not restored; the post keeps its current time.
  update public.posts set
    caption = v_version.caption,
    hashtags = v_version.hashtags,
    media = v_version.media,
    planned_at = case when v_version.planned_at > now() then v_version.planned_at else v_post.planned_at end,
    needs_new_time = case when v_version.planned_at > now() then false else v_post.needs_new_time end,
    last_changed_by = auth.uid(),
    last_changed_at = now()
  where id = v_post.id;
end $$;

revoke all on function public._carepost_lock_post(uuid) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.approve_post(uuid)',
    'public.unapprove_post(uuid)',
    'public.skip_post(uuid)',
    'public.update_post_caption(uuid, text, text[])',
    'public.reschedule_post(uuid, timestamptz)',
    'public.update_post_media(uuid, jsonb)',
    'public.request_post_redo(uuid, text)',
    'public.restore_post_version(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
