-- KelasKita v2: optional images on posts and replies.
--
-- `posts.image_url` has existed since 0001 as a column nothing wrote to, kept "for
-- schema fidelity with the design doc". This gives it a value and adds the same to
-- `comments`, so an image can be the whole message.
--
-- Three decisions worth stating, because each one closes a door that a naive
-- implementation leaves open:
--
-- 1. Uploads are a Server Action's job, not the browser's.
--    The publishable key is public by definition -- it ships to every visitor -- so a
--    client-side upload into a bucket an `anon` key can write to is an upload endpoint
--    for anyone on the internet, bounded only by whatever the client chose to enforce.
--    Sending the compressed `File` to the action instead means the path is generated
--    server-side from the session, the MIME type is checked against a list the client
--    does not control, and `anon` never reaches the bucket at all.
--
-- 2. The bucket constrains what can be stored, not just what is meant to be.
--    `allowed_mime_types` and `file_size_limit` are enforced by storage itself, so a
--    request that bypasses the app still cannot write an executable or a 200MB file.
--
-- 3. An `image_url` can only point inside this bucket.
--    `authenticated` gets INSERT on the column, so a member could otherwise store any
--    URL they liked and have it loaded on every reader's device -- a tracking pixel, a
--    beacon, an image from somewhere else entirely. The CHECK accepts only null or a
--    path under `/storage/v1/object/public/post-images/`, which is the shape
--    `getPublicUrl()` returns. This is the one place where a value the client supplies
--    is checked against the source it claims to come from.
--
-- Guest posts stay text-only. `guest_posts` grants INSERT on `(id, content)` alone and
-- this migration does not widen it, because an image upload attributed to nobody is
-- exactly the kind of thing an abuse quota is hardest to attach to -- and the rate guard
-- that protects `guest_posts` counts rows, not bytes.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  1048576, -- 1 MiB ceiling. The client aims under 500 KB; this is the hard stop.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Read paths are named for this feature rather than reusing Supabase's defaults, so a
-- future `drop policy` here cannot take someone else's read access with it.

-- Public read: the feed is readable while signed out, so an image in it has to be too.
create policy "post_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'post-images');

-- Upload, into your own folder only. `(storage.foldername(name))[1]` is the first path
-- segment, which the action sets to the caller's id -- so a member cannot write over
-- another member's file, and the delete policy below can be written symmetrically.
create policy "post_images_member_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (select auth.uid()) is not null
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No UPDATE policy. File names embed a uuid, so an upload is never overwritten; leaving
-- UPDATE ungranted means an update fails outright rather than orphaning the old object.

-- Delete your own images, or any of them if you moderate. Needed because removing a post
-- should not leave megabytes of someone else's picture behind forever.
create policy "post_images_owner_or_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Comments can carry an image too
-- ---------------------------------------------------------------------------

alter table public.comments add column image_url text;

-- Same shape as the `posts` constraint: the column may be empty, but if it is set it has
-- to be an object this project uploaded.
alter table public.comments
  add constraint comments_image_url_bucket
  check (image_url is null or image_url like '%/storage/v1/object/public/post-images/%');

alter table public.posts
  add constraint posts_image_url_bucket
  check (image_url is null or image_url like '%/storage/v1/object/public/post-images/%');

-- The grants in 0001 name their columns, so a new column is not covered by them.
grant select (id, post_id, content, image_url, anonymous, parent_comment_id, created_at, updated_at)
  on table public.comments to authenticated;
grant insert (id, post_id, image_url, parent_comment_id, content, anonymous)
  on table public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- The thread exposes it
-- ---------------------------------------------------------------------------

-- `image_url` is appended rather than inserted in the middle: PostgreSQL's
-- `create or replace view` may add columns but not reorder existing ones, and this view
-- is also read by `lib/data/comments.ts`, which selects by name. Guest replies join as
-- `null`, which is true rather than a placeholder -- `guest_comments` has no such column
-- and no upload path.
create or replace view public.comment_thread with (security_invoker = false) as
  select
    c.id,
    c.post_id,
    c.content,
    c.anonymous,
    c.parent_comment_id,
    c.created_at,
    case when c.anonymous then 'Anonim' else pr.username end::text as author_name,
    coalesce(((select auth.uid()) = c.user_id), false) as is_mine,
    false as is_guest,
    c.image_url
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
    'Anonim'::text,
    false,
    true as is_guest,
    null::text as image_url
  from public.guest_comments g;

revoke all on public.comment_thread from anon;
grant select on public.comment_thread to anon, authenticated;