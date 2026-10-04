-- KelasKita v2 follow-up: every post can be commented on.
--
-- A guest post was not a row in `posts`, and both comment tables carry
-- `post_id uuid not null references public.posts (id) on delete cascade`. So a
-- comment could not name a guest post -- the database rejected it before the app
-- ever saw it, and the thread UI hid the composer and printed "Tidak bisa
-- dikomentar" to explain a constraint, not a policy.
--
-- That was the wrong shape. A post nobody may answer is not moderation, it is a
-- dead end, and it made an anonymous post the only thing in the class that could
-- not be discussed at all. Guests could already reply on member posts, so the rule
-- was inconsistent as well as restrictive.
--
-- The fix is to state the real invariant -- "the post exists", whichever table it
-- lives in -- instead of the accidental one, "the post is a row in `posts`":
--
--   1. `comments.post_id` and `guest_comments.post_id` lose their foreign key.
--      One uuid cannot reference two tables, which is the same reason 0007 left
--      `guest_comments.parent_comment_id` without one.
--   2. A BEFORE INSERT trigger checks both tables. It is `security definer` because
--      `anon` can read neither, and it raises 23503 -- the code the app already maps
--      to "Postingan ini sudah tidak ada" -- so a missing target is indistinguishable
--      from how it looked when this was still a foreign key.
--   3. The cascade is not lost, it is moved. `on delete cascade` was doing real work
--      beyond tidiness: a deleted account takes its comments with it through the
--      profile cascade, and without it a removed member's comments would linger in
--      somebody else's thread as unattributed rows. A BEFORE DELETE trigger on both
--      post tables now removes the children explicitly, as `security definer` --
--      required, because 0008 revoked DELETE on `comments` from `authenticated`, so
--      the admin's own delete could not clean up after itself.
--
-- A reply may also point at a comment in either table now, which it could not before:
-- `private.validate_comment_parent()` only looked in `comments`, so replying to a
-- guest reply failed with 23514 even on a member post. It now unions the two tables,
-- mirroring `private.validate_guest_comment()` from 0007.
--
-- Nothing about anonymity changes. `comment_thread` still emits `author_name` and
-- never `user_id`; a guest reply is still a row in a table with no author column at
-- all. Reading a thread still goes through the definer view, which a member and a
-- signed-out visitor both have, because both can already read the feed.

-- ---------------------------------------------------------------------------
-- 1. The target is "a post", not "a row in posts"
-- ---------------------------------------------------------------------------

-- Found by what they point at rather than by name. The DDL never named these
-- constraints, so their names are whatever PostgreSQL generated, and an environment
-- created from an edited migration could differ. Scoped to exactly the two tables and
-- the one target, so `comments_parent_comment_id_fkey` is untouched.
do $$
declare
  fk record;
begin
  for fk in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.posts'::regclass
      and conrelid in ('public.comments'::regclass, 'public.guest_comments'::regclass)
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;
end $$;

create or replace function private.validate_comment_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.posts p where p.id = new.post_id)
     or exists (select 1 from public.guest_posts g where g.id = new.post_id) then
    return new;
  end if;

  raise exception 'Postingan tidak ditemukan'
    using errcode = '23503';
end;
$$;

create trigger comments_validate_post
  before insert on public.comments
  for each row execute function private.validate_comment_post();

create trigger guest_comments_validate_post
  before insert on public.guest_comments
  for each row execute function private.validate_comment_post();

-- ---------------------------------------------------------------------------
-- 2. The cascade moves into a trigger
-- ---------------------------------------------------------------------------

-- Replaces what `references public.posts (id) on delete cascade` was doing.
-- `security definer` for the reason above: the invoking role is an admin going
-- through `public.hapus_konten`, and `authenticated` has no DELETE on `comments`,
-- so this could not work any other way.
--
-- Deleting the replies first is not necessary -- `comments.parent_comment_id` is
-- still `on delete cascade` and handles the member tree -- but one statement per
-- table is simpler to reason about than a mix of a cascade and a trigger.
create or replace function private.delete_post_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.comments where post_id = old.id;
  delete from public.guest_comments where post_id = old.id;
  return old;
end;
$$;

create trigger posts_delete_comments
  before delete on public.posts
  for each row execute function private.delete_post_comments();

create trigger guest_posts_delete_comments
  before delete on public.guest_posts
  for each row execute function private.delete_post_comments();

-- ---------------------------------------------------------------------------
-- 3. A reply may point at either kind of comment
-- ---------------------------------------------------------------------------

-- Same signature, so the trigger and its ACL are unchanged. `union all` with
-- `limit 1` mirrors `private.validate_guest_comment()`, which validates the other
-- direction: now that a guest reply can be answered by a member.
create or replace function private.validate_comment_parent()
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

-- ---------------------------------------------------------------------------
-- 4. The moderation RPC takes a guest reply's subtree with it
-- ---------------------------------------------------------------------------

-- `guest_comments.parent_comment_id` has no foreign key by design, so deleting a
-- guest reply left its own replies behind with a parent nobody could reach: they
-- vanished from every thread while still existing. A member comment did not have
-- this problem, because its parent column is `on delete cascade`. Recursive so a
-- reply to a reply goes too; `union` rather than `union all` so a malformed cycle
-- cannot spin.
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
    -- `posts_delete_comments` clears both comment tables first.
    delete from public.posts where id = p_id returning id into v_post_id;

  elsif p_kind = 'comment' then
    -- `parent_comment_id` cascades, so the replies go with it.
    delete from public.comments where id = p_id returning post_id into v_post_id;

  elsif p_kind = 'guest_post' then
    -- Same trigger, same reason.
    delete from public.guest_posts where id = p_id;

  else
    with recursive subtree(id) as (
      select p_id
      union
      select gc.id
      from public.guest_comments gc
      join subtree s on gc.parent_comment_id = s.id
    )
    delete from public.guest_comments gc
    where gc.id in (select id from subtree)
    returning post_id into v_post_id;
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

-- ---------------------------------------------------------------------------
-- 5. The feed counts comments on guest posts
-- ---------------------------------------------------------------------------

-- The guest branch reported `0::int` for `comment_count` because it had nothing to
-- count. It sums both tables now, the way the member branch does, so the comment
-- link under a guest post shows the same number the thread shows.
--
-- Same eleven columns, same order and types: still an append-free replace.
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
    coalesce(
      exists (
        select 1 from public.guest_likes gl
        where gl.guest_post_id = g.id and gl.user_id = (select auth.uid())
      ),
      false
    ),
    (select count(*) from public.guest_likes gl2 where gl2.guest_post_id = g.id)::int,
    (select count(*) from public.comments c2 where c2.post_id = g.id)::int
      + (select count(*) from public.guest_comments gc2 where gc2.post_id = g.id)::int as comment_count,
    true as is_guest
  from public.guest_posts g;

revoke all on public.post_feed from anon;
grant select on public.post_feed to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS stays where it was
-- ---------------------------------------------------------------------------

-- Nothing here touches a policy or a grant on purpose. Both tables already grant
-- INSERT on `post_id`, and both insert policies are `with check (true)` -- the
-- integrity check that was missing lived in the schema, and it now lives in the
-- trigger above instead. The comment tables keep their anonymity properties
-- exactly: no client can read an author column, and a guest reply has no author
-- column to read.