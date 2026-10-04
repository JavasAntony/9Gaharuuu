-- KelasKita v2 follow-up: let a signed-out visitor reply.
--
-- Guest replies do NOT go into `public.comments`. `comments.user_id` is
-- `not null references profiles (id)`, and the whole v1 privacy model rests on
-- that column being unreadable and unforgeable by the client. Making it nullable
-- would mean every owner helper, policy and definer view has to start
-- distinguishing "no author" from "some author", which is exactly the shape of
-- bug that leaks an identity later.
--
-- So a guest reply gets its own table, with the same properties `guest_posts`
-- has from 0002:
--
--   * no author column at all, so anonymity is structural rather than a policy;
--   * no image column, so a guest reply is text-only by construction and not by
--     validation;
--   * no client SELECT grant, so nobody can read the table back -- replies reach
--     the UI through the `comment_thread` view, exactly as posts reach it
--     through `post_feed`;
--   * INSERT granted per column, so sending one more field raises 42501 instead
--     of being silently dropped;
--   * `created_at` not granted, so a guest cannot backdate a reply to slide it
--     out of the admin list.
--
-- `parent_comment_id` cannot have a foreign key, because a reply may point at a
-- row in either table. `private.validate_guest_comment()` replaces it: it runs as
-- the definer, so it can read what `anon` cannot, and it rejects a parent from a
-- different post exactly like `private.validate_comment_parent()` does in 0001.
--
-- The foreign key to `public.posts` also settles which post a guest reply can
-- land on: guest posts are not rows in that table, so a guest reply can never
-- attach to a guest post.
--
-- Guest replies are deliberately NOT reportable. `buat_laporan` resolves
-- `p_comment_id` against `public.comments`, so a guest comment id raises P0002 --
-- the same trade-off 0002 made for guest posts, for the same reason: a report
-- targets exactly one `posts.id` or `comments.id`. The consequence is identical
-- too. Without the admin list at the end of this file, guest content would be
-- unmoderatable.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.guest_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_comment_id uuid,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index guest_comments_post_idx on public.guest_comments (post_id, created_at);
create index guest_comments_parent_idx on public.guest_comments (parent_comment_id);

revoke all on table public.guest_comments from anon, authenticated;

grant insert (id, post_id, parent_comment_id, content) on table public.guest_comments to anon;
-- Delete only: an admin removes a guest reply through the policy below, and
-- `anon` gets nothing.
grant delete on table public.guest_comments to authenticated;

alter table public.guest_comments enable row level security;

-- ---------------------------------------------------------------------------
-- Guard functions
-- ---------------------------------------------------------------------------

-- A reply must belong to the same post as its parent, whichever table the parent
-- lives in. `security definer` because `anon` has no SELECT on either table.
create or replace function private.validate_guest_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_post_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select c.post_id into parent_post_id
  from public.comments c
  where c.id = new.parent_comment_id
  union all
  select g.post_id
  from public.guest_comments g
  where g.id = new.parent_comment_id
  limit 1;

  if parent_post_id is distinct from new.post_id then
    raise exception 'Balasan harus berada di post yang sama'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Flood guard, per client address. Same shape as `guest_post_rate_ok()` from
-- 0002, with a tighter ceiling: a thread is smaller than the feed, so fewer
-- replies is enough to fill one up.
create or replace function private.guest_comment_rate_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*) from public.guest_comments
    where created_at > now() - interval '1 hour'
  ) < 60;
$$;

create trigger guest_comments_validate_parent
  before insert on public.guest_comments
  for each row execute function private.validate_guest_comment();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create policy "anyone creates guest comments" on public.guest_comments
  for insert to anon
  with check ((select private.guest_comment_rate_ok()));

create policy "admins delete guest comments" on public.guest_comments
  for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Reads: the thread view and the feed's comment count
-- ---------------------------------------------------------------------------

-- `create or replace` rather than drop and recreate, which is what 0005 did for
-- `post_feed`: the column list below is 0001's definition with `is_guest`
-- appended, and PostgreSQL allows replacing a view with a definition that appends
-- columns. Dropping the view would briefly remove the app's only comment read
-- path, for no gain.
create or replace view public.comment_thread with (security_invoker = false) as
  select
    c.id,
    c.post_id,
    c.content,
    c.anonymous,
    c.parent_comment_id,
    c.created_at,
    case when c.anonymous then 'Anonim' else pr.username end::text as author_name,
    ((select auth.uid()) = c.user_id) as is_mine,
    false as is_guest
  from public.comments c
  left join public.profiles pr on pr.id = c.user_id
  union all
  select
    g.id,
    g.post_id,
    g.content,
    true as anonymous,
    g.parent_comment_id,
    g.created_at,
    'Anonim'::text as author_name,
    false as is_mine,
    true as is_guest
  from public.guest_comments g;

revoke all on public.comment_thread from anon;
grant select on public.comment_thread to anon, authenticated;

-- The feed's comment count has to see both tables, or a guest reply makes the
-- count look like nothing happened. Same eleven columns as 0005, in the same
-- order and types, so this is still an append-free replace.
create or replace view public.post_feed with (security_invoker = false) as
  select
    p.id,
    p.content,
    p.image_url,
    p.anonymous,
    p.created_at,
    case when p.anonymous then 'Anonim' else pr.username end::text as author_name,
    coalesce(((select auth.uid()) = p.user_id), false) as is_mine,
    exists (
      select 1 from public.likes l
      where l.post_id = p.id and l.user_id = (select auth.uid())
    ) as liked_by_me,
    (select count(*) from public.likes l2 where l2.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int
      + (select count(*) from public.guest_comments gc where gc.post_id = p.id)::int as comment_count,
    false as is_guest
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id
  union all
  select
    g.id,
    g.content,
    null::text,
    true,
    g.created_at,
    'Anonim'::text,
    false,
    false,
    0::int,
    0::int,
    true as is_guest
  from public.guest_posts g;

revoke all on public.post_feed from anon;
grant select on public.post_feed to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

-- `guest_comment` joins `guest_post` as a target type. PostgreSQL named the
-- column check itself, so it is dropped by that name and recreated wider.
alter table public.moderation_logs drop constraint moderation_logs_target_type_check;
alter table public.moderation_logs
  add constraint moderation_logs_target_type_check
  check (target_type in ('post', 'comment', 'guest_post', 'guest_comment', 'report'));

-- Same signature as 0002's function, one more branch. `create or replace` keeps
-- the existing ACL, but the revokes and grants are restated anyway so the file
-- reads in order and cannot drift from the signature above it.
create or replace function public.hapus_konten(
  p_kind text,
  p_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_post_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa menghapus konten'
      using errcode = '42501';
  end if;

  if p_kind not in ('post', 'comment', 'guest_post', 'guest_comment') then
    raise exception 'Jenis konten tidak dikenal'
      using errcode = '22023';
  end if;

  if p_kind = 'post' then
    delete from public.posts where id = p_id returning id into v_post_id;

  elsif p_kind = 'comment' then
    delete from public.comments where id = p_id returning post_id into v_post_id;

  elsif p_kind = 'guest_post' then
    delete from public.guest_posts where id = p_id;

  else
    -- A guest reply does have a thread page, so its post id comes back and the
    -- caller revalidates that page.
    delete from public.guest_comments where id = p_id returning post_id into v_post_id;
  end if;

  if p_kind in ('post', 'comment', 'guest_comment') and v_post_id is null then
    raise exception 'Konten tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (v_admin, 'content_delete', p_kind, p_id, nullif(btrim(p_reason), ''));

  return v_post_id;
end;
$$;

revoke execute on function public.hapus_konten(text, uuid, text) from public, anon;
grant execute on function public.hapus_konten(text, uuid, text) to authenticated;

-- Guest replies have no report path, so without this list they would be
-- unmoderatable content: `admin_guest_posts` for guest posts, this for guest
-- replies.
create or replace view public.admin_guest_comments with (security_invoker = false) as
  select
    g.id,
    g.post_id,
    g.parent_comment_id,
    g.content,
    g.created_at
  from public.guest_comments g
  where (select private.is_admin())
  order by g.created_at desc;

revoke all on public.admin_guest_comments from anon;
grant select on public.admin_guest_comments to authenticated;