-- KelasKita v2 follow-up: a guest post can be liked.
--
-- The feed renders one row per post and every row has the same controls. That made
-- the guest branch of `post_feed` a lie: it reported `like_count = 0` and
-- `liked_by_me = false` for good, because `public.likes.post_id` references
-- `public.posts (id)` and a guest post is not a row in `posts`. Tapping the heart on
-- one raised 23503 every single time.
--
-- The choices were: hide the heart again, so the feed advertises that anonymous
-- content is second-class; or let a member like it. This does the second, using the
-- arrangement 0007 already established for guest replies -- a separate table, read
-- only through the definer view:
--
--   * `guest_likes` is keyed `(user_id, guest_post_id)`, the same composite primary
--     key as `likes`, so a double tap collides instead of double counting;
--   * a member is named and a guest is not, so liking needs an account -- the same
--     rule as everywhere else. There is no such thing as a guest like;
--   * `user_id` is the only column that could name a liker, and the read grant and
--     the SELECT policy are both scoped to the caller's own row, so it discloses
--     nothing about anybody else;
--   * INSERT is granted per column, so `created_at` is not settable: a like cannot
--     be backdated. (`likes` grants INSERT at table level, which allows it; that is
--     pre-existing and harmless there because nothing orders by it.);
--   * `anon` gets nothing at all.
--
-- Deleting the guest post removes its likes through the foreign key, so an admin
-- removal leaves no orphan behind -- the same guarantee `posts` already had.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.guest_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  guest_post_id uuid not null references public.guest_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, guest_post_id)
);

-- the primary key leads with user_id, so counting likes per guest post needs this,
-- exactly like `likes_post_idx` in 0001.
create index guest_likes_post_idx on public.guest_likes (guest_post_id);

revoke all on table public.guest_likes from anon, authenticated;

-- Same shape as the `likes` grants: the caller reads its own two columns and writes
-- them, and nothing else. Only `auth.uid()`'s own row is visible, which is what the
-- policies below allow.
grant select (user_id, guest_post_id) on table public.guest_likes to authenticated;
grant insert (user_id, guest_post_id) on table public.guest_likes to authenticated;
grant delete on table public.guest_likes to authenticated;

alter table public.guest_likes enable row level security;

create policy "members read own guest likes" on public.guest_likes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "members create own guest likes" on public.guest_likes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "members delete own guest likes" on public.guest_likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- The feed
-- ---------------------------------------------------------------------------

-- Same eleven columns, in the same order and types, so this is still an append-free
-- replace. Only the guest branch changes: instead of hardcoding zeros it now counts
-- `guest_likes` and resolves `liked_by_me` against the caller's JWT, the same way
-- the member branch does with `likes`.
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
    0::int,
    true as is_guest
  from public.guest_posts g;

revoke all on public.post_feed from anon;
grant select on public.post_feed to anon, authenticated;