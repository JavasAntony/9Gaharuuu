-- Clean database reset: every post, comment, like, report and log, and nothing else.
--
-- Run this in the Supabase SQL editor, or with psql against the linked project.
-- `scripts/reset-content.mjs` runs the same wipe over the API *and* empties the
-- `post-images` bucket, which is the half SQL cannot do.
--
-- ---------------------------------------------------------------------------
-- What is deliberately NOT here
-- ---------------------------------------------------------------------------
--
--   * `profiles` and `auth.users`. Accounts survive a content reset. If you want the
--     classmates gone too, that is `npm run seed:users` from an empty project, or
--     deleting them from /admin/pengguna -- never a TRUNCATE, because a TRUNCATE would
--     cascade into `auth.users` and take every login with it.
--
--   * `announcements`. A site-wide announcement is not content; it survives so a reset
--     does not silently retract something the class was told. Delete it from
--     /admin/pengumuman if you really mean it.
--
-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
--
-- There is nothing to reset, and that is a design decision rather than an oversight: every
-- primary key in this schema is `uuid default gen_random_uuid()`, so no table owns a
-- sequence. `RESTART IDENTITY` below is harmless and is kept so this script keeps working
-- if a future migration does add one -- a `serial` id would otherwise silently continue
-- from where it left off and any id a client cached before the reset would still resolve.
--
-- ---------------------------------------------------------------------------
-- Order
-- ---------------------------------------------------------------------------
--
-- One statement, so there is no window in which a reader could see an empty feed with the
-- comments still attached. `CASCADE` covers the foreign keys that remain (`likes.post_id`,
-- `guest_likes.guest_post_id`, the author columns), and the tables with no FK to posts or
-- comments -- `guest_comments`, `reports`, `moderation_logs` -- are named explicitly,
-- because `CASCADE` cannot reach a table that does not point at anything being truncated.
--
-- `reports` in particular holds no foreign key to the reported content on purpose (0002),
-- so deleting posts would leave the queue full of rows pointing at nothing.

begin;

-- Read this first if you want to know what you are about to lose.
select 'posts' as tabel, count(*) from public.posts
union all select 'comments', count(*) from public.comments
union all select 'likes', count(*) from public.likes
union all select 'guest_posts', count(*) from public.guest_posts
union all select 'guest_comments', count(*) from public.guest_comments
union all select 'guest_likes', count(*) from public.guest_likes
union all select 'reports', count(*) from public.reports
union all select 'moderation_logs', count(*) from public.moderation_logs;

truncate table
  public.guest_likes,
  public.guest_comments,
  public.guest_posts,
  public.likes,
  public.comments,
  public.posts,
  public.reports,
  public.moderation_logs
restart identity cascade;

-- The `storage.objects` rows for the bucket are deliberately left alone here. Deleting
-- them from SQL would remove the record of each object while leaving the file itself in
-- place -- the Storage API is what actually unlinks a file -- which would produce a bucket
-- that claims to be empty and still serves every old image. Use the Node script.

commit;

-- Everything should read zero. `storage.objects` should not: the files are still there.
select 'posts' as tabel, count(*) from public.posts
union all select 'comments', count(*) from public.comments
union all select 'likes', count(*) from public.likes
union all select 'guest_posts', count(*) from public.guest_posts
union all select 'guest_comments', count(*) from public.guest_comments
union all select 'guest_likes', count(*) from public.guest_likes
union all select 'reports', count(*) from public.reports
union all select 'moderation_logs', count(*) from public.moderation_logs
union all select 'storage objects', count(*) from storage.objects where bucket_id = 'post-images';