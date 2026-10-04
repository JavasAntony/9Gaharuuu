-- KelasKita v2: let an image be the whole post.
--
-- 0014 gave `posts.image_url` and `comments.image_url` real values and left `min(1)` off
-- `postSchema` and `commentSchema`, so an empty body stopped being a validation error on
-- its own. The tables were never moved with it. The CHECK that 0001 wrote on
-- `posts.content` still reads `char_length(content) between 1 and 2000`, so a post whose
-- only content is a picture was refused by the database with `23514` -- after the action
-- had already uploaded the image, on a path whose error handling does not mention a length
-- violation. Nothing above the database contradicted the schema; the schema contradicted
-- the schema.
--
-- This replaces the lower bound with the rule the actions were already enforcing in
-- `hasTextOrImage`: at least one of the two has to be there. Writing it as one CHECK rather
-- than simply loosening the bound to zero is the point -- a row with neither a caption nor
-- a picture is not a post, and the database is the only place that statement is still true
-- for every writer, including a script that never touches the Server Action.
--
-- The upper bounds are unchanged. `postSchema` and `commentSchema` still refuse more than
-- `MAX_POST_LENGTH` / `MAX_COMMENT_LENGTH` characters, and this keeps the same ceiling
-- behind them for a writer that skips them.
--
-- `guest_posts` and `guest_comments` are deliberately not in this migration. Neither has an
-- `image_url` column and neither has an upload path, so "text or nothing" is still the
-- whole rule there and their CHECKs stay exactly as 0001 and 0002 wrote them.
--
-- Both constraints are re-added under the names PostgreSQL gave them in 0001
-- (`<table>_content_check`), so a drop that somehow matched nothing makes the `add` fail
-- loudly instead of quietly leaving the old bound in place beside the new one.

alter table public.posts drop constraint if exists posts_content_check;

alter table public.posts
  add constraint posts_content_check
  check (
    char_length(content) between 0 and 2000
    and (char_length(content) > 0 or image_url is not null)
  );

alter table public.comments drop constraint if exists comments_content_check;

alter table public.comments
  add constraint comments_content_check
  check (
    char_length(content) between 0 and 1000
    and (char_length(content) > 0 or image_url is not null)
  );
