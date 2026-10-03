-- KelasKita v1 initial schema.
--
-- Privacy model (the reason the grants below look unusual):
--   No client may ever read `posts.user_id` or `comments.user_id`. RLS filters
--   rows, not columns, so the anonymity guarantee is carried by COLUMN-LEVEL
--   GRANTS, not by policies. `authenticated` gets a SELECT grant listing every
--   column except the author column, so `GET /rest/v1/posts?select=user_id`
--   fails with 42501 while `select=id,content` works.
--
--   Consequence: RLS policy expressions are part of the query, and referencing a
--   column in one requires SELECT on it ("This privilege is also needed to
--   reference existing column values in UPDATE, DELETE" -- PostgreSQL docs,
--   5.8 Privileges). So no policy below may mention `user_id`. Ownership is
--   resolved inside `security definer` helpers in `private`, which run with the
--   owner's rights, and authorship is stamped by BEFORE INSERT triggers instead
--   of being supplied by the client.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,24}$'),
  role text not null default 'member' check (role in ('member', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  -- unused in v1, kept for schema fidelity with the design doc
  image_url text,
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts (created_at desc, id desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_comment_id);

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
-- the primary key leads with user_id, so counting likes per post needs this
create index likes_post_idx on public.likes (post_id);

-- ---------------------------------------------------------------------------
-- Trigger functions (all in `private`, all with `set search_path = ''`)
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A reply must belong to the same post as its parent. This cannot be a CHECK
-- constraint because CHECK cannot reference other rows.
create or replace function private.validate_comment_parent()
returns trigger
language plpgsql
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
  where c.id = new.parent_comment_id;

  if parent_post_id is distinct from new.post_id then
    raise exception 'Balasan harus berada di post yang sama'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Authorship is stamped from the caller's verified JWT claim, never taken from
-- the request body. The client has no INSERT grant on these columns anyway.
create or replace function private.stamp_post_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  return new;
end;
$$;

create or replace function private.stamp_comment_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
begin
  new_username := new.raw_user_meta_data ->> 'username';

  if new_username is null or new_username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'User metadata must carry a valid username (3-24 chars, a-z 0-9 . _ -)'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, username)
  values (new.id, new_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Ownership checks for RLS policies. `security definer` so they can read the
-- author columns the caller cannot. They take only granted columns (`id`), so
-- the policies that call them stay privilege-clean.
create or replace function private.owns_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function private.owns_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comments c
    where c.id = p_comment_id
      and c.user_id = (select auth.uid())
  );
$$;

create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function private.touch_updated_at();

create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function private.touch_updated_at();

create trigger comments_validate_parent
  before insert or update on public.comments
  for each row execute function private.validate_comment_parent();

create trigger posts_stamp_author
  before insert on public.posts
  for each row execute function private.stamp_post_author();

create trigger comments_stamp_author
  before insert on public.comments
  for each row execute function private.stamp_comment_author();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Table-level SELECT is never granted on a base table, so `select=*` fails
-- loudly instead of silently leaking the author column.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
revoke all on table public.likes from anon, authenticated;

-- `user_id` is deliberately absent from both grant lists.
grant select (id, content, image_url, anonymous, created_at, updated_at)
  on table public.posts to authenticated;
-- INSERT is granted per column so that sending `user_id` raises 42501
-- ("column is write-protected") rather than being silently overwritten.
grant insert (id, content, image_url, anonymous) on table public.posts to authenticated;
grant delete on table public.posts to authenticated;

grant select (id, post_id, content, anonymous, parent_comment_id, created_at, updated_at)
  on table public.comments to authenticated;
grant insert (id, post_id, parent_comment_id, content, anonymous)
  on table public.comments to authenticated;
grant delete on table public.comments to authenticated;

-- likes exposes `user_id` on purpose: it is the caller's own id, the table
-- carries no other identity, and the policies below need to reference it.
grant select (user_id, post_id) on table public.likes to authenticated;
grant insert, delete on table public.likes to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

-- Every member reads every row; authorship is hidden by the grants above, not
-- by filtering rows out.
create policy "members read posts" on public.posts
  for select to authenticated using (true);

create policy "members create posts" on public.posts
  for insert to authenticated with check (true);

create policy "owners delete posts" on public.posts
  for delete to authenticated using ((select private.owns_post(id)));

create policy "members read comments" on public.comments
  for select to authenticated using (true);

create policy "members create comments" on public.comments
  for insert to authenticated with check (true);

create policy "owners delete comments" on public.comments
  for delete to authenticated using ((select private.owns_comment(id)));

create policy "members read own likes" on public.likes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "members create own likes" on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "members delete own likes" on public.likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Definer views
-- ---------------------------------------------------------------------------

-- Views default to security-definer semantics: the query runs with the view
-- owner's rights. That is what lets these views read `user_id` and emit only
-- `author_name`, with `is_mine` / `liked_by_me` resolved from the caller's JWT.
--
-- RISK: this only works if the view owner has BYPASSRLS. If it does not, these
-- views return nothing at all. Check it once after `db push` (SQL editor):
--
--   select c.relname, pg_get_userbyid(c.relowner) as owner, r.rolbypassrls
--   from pg_class c join pg_roles r on r.oid = c.relowner
--   where c.relname in ('post_feed', 'comment_thread', 'me');
--
-- and if `rolbypassrls` is false, run `alter view public.<name> owner to postgres;`.
-- `npm run test:rls` asserts the observable behaviour (post_feed returns rows),
-- so a silent regression here fails the test suite rather than the app.
create or replace view public.post_feed with (security_invoker = false) as
  select
    p.id,
    p.content,
    p.image_url,
    p.anonymous,
    p.created_at,
    case when p.anonymous then 'Anonim' else pr.username end::text as author_name,
    ((select auth.uid()) = p.user_id) as is_mine,
    exists (
      select 1 from public.likes l
      where l.post_id = p.id and l.user_id = (select auth.uid())
    ) as liked_by_me,
    (select count(*) from public.likes l2 where l2.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id;

create or replace view public.comment_thread with (security_invoker = false) as
  select
    c.id,
    c.post_id,
    c.content,
    c.anonymous,
    c.parent_comment_id,
    c.created_at,
    case when c.anonymous then 'Anonim' else pr.username end::text as author_name,
    ((select auth.uid()) = c.user_id) as is_mine
  from public.comments c
  left join public.profiles pr on pr.id = c.user_id;

create or replace view public.me with (security_invoker = false) as
  select p.id, p.username, p.role, p.created_at
  from public.profiles p
  where p.id = (select auth.uid());

revoke all on public.post_feed from anon;
revoke all on public.comment_thread from anon;
revoke all on public.me from anon;

grant select on public.post_feed to authenticated;
grant select on public.comment_thread to authenticated;
grant select on public.me to authenticated;
