-- KelasKita v2 follow-up: make `post_feed.is_mine` a real boolean.
--
-- In v1 the expression `(select auth.uid()) = p.user_id` is only ever evaluated
-- with a non-null uid, because the only reader was a signed-in member. v2 grants
-- the feed to `anon`, and for them `auth.uid()` is null, so the comparison
-- returned null rather than false. Callers treat it as falsy so nothing broke,
-- but the column no longer matched its declared boolean contract.
--
-- Wrapping it in coalesce makes the contract true again: "is this mine?" is false
-- for everybody who is not the author, including anonymous visitors.

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
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
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
    0::int
  from public.guest_posts g;