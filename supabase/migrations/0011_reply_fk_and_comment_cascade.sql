-- KelasKita v2 follow-up: replies point at either kind of comment, and the
-- cascades that came from the foreign keys are restored by hand.
--
-- 0010 made `comments.post_id` and `guest_comments.post_id` reference "a post"
-- rather than "a row in `posts`," and relaxed the delete cascades to match. Two
-- things were missed, and both showed up the moment anything was actually used:
--
-- 1. `comments.parent_comment_id` was left with its foreign key to `comments (id)`.
--    So a member still could not reply to a guest reply -- exactly the mirror of the
--    case 0007 had already fixed for guest replies replying to member comments. It
--    failed with 23503 on the foreign key, before the rewritten parent trigger in
--    0010 ever got a say.
--
-- 2. The rewritten `hapus_konten` deleted a guest reply's subtree with a recursive
--    CTE and then asked for `returning post_id into`, which PL/pgSQL only accepts
--    for a single row. Deleting a reply with a reply under it raised P0003.
--
-- Dropping the parent foreign key means the reply cascade has to be rebuilt by hand
-- as well, so this file also adds the trigger that replaces it.
--
-- The invariant being protected is unchanged, only where it lives: a reply belongs
-- to the same post as its parent, and deleting a comment deletes what hangs below
-- it. `private.validate_comment_parent()` checks the first on every insert; the
-- trigger below does the second on every delete.

-- ---------------------------------------------------------------------------
-- 1. Drop the parent foreign key
-- ---------------------------------------------------------------------------

-- Scoped to `comments` referencing `comments`, which is the self-referential parent
-- column and nothing else.
do $$
declare
  fk record;
begin
  for fk in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.comments'::regclass
      and conrelid = 'public.comments'::regclass
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Deleting a comment takes what hangs below it
-- ---------------------------------------------------------------------------

-- Replaces `parent_comment_id uuid references public.comments (id) on delete
-- cascade`.
--
-- `security definer` because 0008 revoked DELETE on `comments` from `authenticated`:
-- an admin going through `public.hapus_konten` has no grant here, so a trigger
-- running as the invoker would delete nothing.
--
-- The walk is a breadth-first loop rather than a recursive CTE because a subtree can
-- alternate between the two tables -- a guest reply can be answered by a member now,
-- and that answer can itself be answered by a guest -- and PostgreSQL rejects a
-- recursive term that references the CTE more than once, which is what combining
-- two tables would require.
--
-- `old.id` is deliberately never a target. The statement that fired this trigger is
-- already deleting that row, and deleting it a second time from inside its own
-- trigger is how a nested delete ends up fighting the outer command. Every row is
-- therefore removed by exactly one statement: the one belonging to its parent's
-- deletion.
create or replace function private.delete_comment_subtree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_frontier uuid[];
begin
  v_frontier := array[old.id];

  loop
    delete from public.comments
      where parent_comment_id = any(v_frontier)
      returning id into v_frontier;

    exit when coalesce(array_length(v_frontier, 1), 0) = 0;

    delete from public.guest_comments
      where parent_comment_id = any(v_frontier)
      returning id into v_frontier;

    exit when coalesce(array_length(v_frontier, 1), 0) = 0;
  end loop;

  return old;
end;
$$;

create trigger comments_delete_replies
  before delete on public.comments
  for each row execute function private.delete_comment_subtree();

create trigger guest_comments_delete_replies
  before delete on public.guest_comments
  for each row execute function private.delete_comment_subtree();

-- ---------------------------------------------------------------------------
-- 3. The post-level cascade, scoped so nothing is deleted twice
-- ---------------------------------------------------------------------------

-- 0010's version of this function deleted every row with a matching `post_id`, which
-- now overlaps with the trigger above: the rows it deletes are the ones that trigger
-- then tries to delete. Deleting only the top-level rows and letting the trigger
-- recurse gives each row one owner, and it is exact -- `validate_comment_parent()`
-- guarantees a reply's parent is on the same post, so nothing hangs below a row that
-- this statement does not reach.
create or replace function private.delete_post_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.comments
    where post_id = old.id and parent_comment_id is null;
  delete from public.guest_comments
    where post_id = old.id and parent_comment_id is null;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. hapus_konten goes back to deleting one row
-- ---------------------------------------------------------------------------

-- The subtree is the trigger's job now, so this is the 0007 shape again -- and the
-- `returning ... into` that raised P0003 is gone with it. Same signature, so the ACL
-- from 0002 still holds; the grants are restated so the file reads in order.
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
    -- `posts_delete_comments` clears both comment tables, recursively.
    delete from public.posts where id = p_id returning id into v_post_id;

  elsif p_kind = 'comment' then
    -- `comments_delete_replies` takes the replies, in either table.
    delete from public.comments where id = p_id returning post_id into v_post_id;

  elsif p_kind = 'guest_post' then
    delete from public.guest_posts where id = p_id;

  else
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

-- ---------------------------------------------------------------------------
-- 5. RLS and grants are untouched
-- ---------------------------------------------------------------------------

-- Nothing here changes who may write what. The insert policies were already
-- `with check (true)`, and the checks they relied on -- same post, post exists --
-- live in the triggers from 0010 and above. An author column is still unreadable by
-- any client, and a guest reply still has no author column to read.