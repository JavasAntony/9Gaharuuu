-- KelasKita v2 follow-up: let the UI tell a guest post apart.
--
-- `post_feed` unions member posts and guest posts, and the two are otherwise
-- indistinguishable to a reader: both show `Anonim`, `image_url` is null, and a
-- guest post always has zero likes and comments. That matters for two behaviours:
--
--   * a guest post cannot be reported, because a report targets exactly one
--     `posts.id` or `comments.id` and a guest post has neither;
--   * a guest post belongs to nobody, so only an admin can delete it.
--
-- `is_guest` is a boolean the feed reader can already infer from the absence of
-- an author, so it exposes nothing new.
--
-- `CREATE OR REPLACE VIEW` is not used: rather than rely on whether Postgres
-- allows appending columns to an existing view, drop and recreate it.

drop view public.post_feed;

create view public.post_feed with (security_invoker = false) as
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
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count,
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