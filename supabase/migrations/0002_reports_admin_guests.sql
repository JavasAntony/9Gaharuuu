-- KelasKita v2: reports, admin moderation, and guest anonymous posts.
--
-- This migration extends the v1 privacy model instead of relaxing it. The rules
-- from 0001_init.sql still hold:
--
--   * `authenticated` has no table-level SELECT on any base table and no grant on
--     any author column. RLS filters rows, not columns, so the anonymity
--     guarantee is carried by grants.
--   * No RLS policy may reference a column the caller cannot read. Ownership and
--     role checks therefore go through `security definer` helpers in `private`
--     that take only granted columns.
--   * `RETURNING` raises under column-level grants, so mutations never chain
--     `.select()` and never ask PostgREST for `return=representation`.
--
-- Three new ideas:
--
-- 1. GUEST POSTS LIVE IN THEIR OWN TABLE. `public.guest_posts` has no author
--    column and no image column at all. That makes forging a `user_id`,
--    impersonating someone, or writing into another account structurally
--    impossible rather than merely denied by a policy, and it makes the
--    text-only rule impossible to bypass through a hidden endpoint.
--
-- 2. REPORTS AND MODERATION LOGS HAVE NO CLIENT GRANTS. `authenticated` gets no
--    SELECT, INSERT, UPDATE or DELETE on `public.reports` or
--    `public.moderation_logs`, and both have RLS enabled with no policies at
--    all. Every write goes through a `security definer` RPC that stamps
--    `reporter_id` / `resolved_by` / `admin_id` from `auth.uid()`, so a client
--    cannot forge an identity or resolve its own report.
--
-- 3. ADMIN READS GO THROUGH DEFINER VIEWS GATED ON THE ROLE. `admin_reports` and
--    `admin_guest_posts` carry `where (select private.is_admin())`. Views run as
--    their owner while `auth.uid()` still resolves from the caller's JWT, which
--    is the same mechanism the v1 `me` view already relies on. A non-admin gets
--    zero rows rather than an error, and the app hides the navigation too, but
--    neither is the security boundary.

-- ---------------------------------------------------------------------------
-- Admin role helper
-- ---------------------------------------------------------------------------

-- Policy expressions are evaluated as the calling role, which has no SELECT on
-- `profiles`, so the role check has to happen inside a definer function.
-- `security definer` + `set search_path = ''` keeps it unspoofable.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Guest posts
-- ---------------------------------------------------------------------------

-- No author column: a guest post belongs to nobody, so there is no identity to
-- forge and nothing for a normal user (or a moderator) to leak. No image_url
-- either, which is what enforces the text-only rule at the storage layer.
create table public.guest_posts (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index guest_posts_created_at_idx on public.guest_posts (created_at desc, id desc);

-- Flood guard, enforced by Postgres so it also holds against a raw PostgREST
-- request that never touches the Next.js action. This is a capacity limit on the
-- table, not per-person rate limiting: Postgres has no reliable client address
-- to key on. 120/hour is well above real class use and low enough that a bot
-- cannot fill the table.
create or replace function private.guest_post_rate_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*) from public.guest_posts
    where created_at > now() - interval '1 hour'
  ) < 120;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- No foreign keys to posts/comments on purpose. `on delete cascade` would
-- destroy the moderation audit trail the instant a moderator removed the
-- reported content, which is exactly when the trail matters most. The RPC
-- validates that the target exists at report time; the admin view LEFT JOINs so
-- a report against since-deleted content renders as "removed".
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid,
  comment_id uuid,
  reason text not null check (
    reason in ('spam', 'harassment', 'bullying', 'inappropriate', 'hate', 'other')
  ),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  -- exactly one target; nothing can null them out later because there is no FK
  constraint reports_have_one_target check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  )
);

-- One report per reporter per target, so a double tap cannot flood the queue.
-- The expression collapses the two target columns into one comparable value.
create unique index reports_one_per_reporter_target
  on public.reports (reporter_id, (coalesce(post_id, comment_id)));

create index reports_status_created_at_idx on public.reports (status, created_at desc);
create index reports_post_id_idx on public.reports (post_id) where post_id is not null;
create index reports_comment_id_idx on public.reports (comment_id) where comment_id is not null;

-- ---------------------------------------------------------------------------
-- Moderation log
-- ---------------------------------------------------------------------------

-- Append-only from the application's point of view: no client grant, no INSERT
-- policy. Rows are written only inside the definer RPCs below, which stamp
-- admin_id from auth.uid() so an admin cannot put someone else's name on an
-- action.
create table public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (
    action in ('report_review', 'report_resolve', 'report_dismiss', 'content_delete')
  ),
  target_type text not null check (target_type in ('post', 'comment', 'guest_post', 'report')),
  target_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index moderation_logs_created_at_idx on public.moderation_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- File a report. Takes no reporter, status or resolver parameter: those are
-- stamped from auth.uid() and from the column default, so there is nothing for a
-- client to lie about.
create or replace function public.buat_laporan(
  p_post_id uuid,
  p_comment_id uuid,
  p_reason text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid := (select auth.uid());
begin
  if v_reporter is null then
    raise exception 'Hanya anggota kelas yang bisa melapor'
      using errcode = '42501';
  end if;

  if (p_post_id is null) = (p_comment_id is null) then
    raise exception 'Laporan harus menunjuk tepat satu konten'
      using errcode = '22023';
  end if;

  if p_reason is null or p_reason not in (
    'spam', 'harassment', 'bullying', 'inappropriate', 'hate', 'other'
  ) then
    raise exception 'Alasan laporan tidak dikenal'
      using errcode = '22023';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Keterangan laporan terlalu panjang'
      using errcode = '22023';
  end if;

  -- The target must exist. `new` cannot be a member post the reporter is not
  -- allowed to see, because every member can read every post anyway.
  if p_post_id is not null
     and not exists (select 1 from public.posts p where p.id = p_post_id) then
    raise exception 'Postingan tidak ditemukan'
      using errcode = 'P0002';
  end if;

  if p_comment_id is not null
     and not exists (select 1 from public.comments c where c.id = p_comment_id) then
    raise exception 'Komentar tidak ditemukan'
      using errcode = 'P0002';
  end if;

  begin
    insert into public.reports (reporter_id, post_id, comment_id, reason, description)
    values (v_reporter, p_post_id, p_comment_id, p_reason, nullif(btrim(p_description), ''));
  exception
    -- Already reported this exact target: idempotent, not an error.
    when unique_violation then
      return;
  end;
end;
$$;

-- Move a report along. Returns the resolved admin id so the action is
-- attributable, or raises if the caller is not an admin.
create or replace function public.tinjau_laporan(p_report_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_status_before text;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa meninjau laporan'
      using errcode = '42501';
  end if;

  if p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Status laporan tidak dikenal'
      using errcode = '22023';
  end if;

  update public.reports
  set status = p_status,
      resolved_by = case when p_status in ('resolved', 'dismissed') then v_admin else null end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id
  returning status into v_status_before;

  if v_status_before is null then
    raise exception 'Laporan tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id)
  values (
    v_admin,
    case p_status
      when 'reviewing' then 'report_review'
      when 'resolved' then 'report_resolve'
      else 'report_dismiss'
    end,
    'report',
    p_report_id
  );

  return v_admin;
end;
$$;

-- Remove reported content as an admin. Returns the id of the post page that
-- needs revalidating (null for a guest post, which has no page).
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

  if p_kind = 'post' then
    delete from public.posts where id = p_id returning id into v_post_id;

  elsif p_kind = 'comment' then
    delete from public.comments where id = p_id returning post_id into v_post_id;

  elsif p_kind = 'guest_post' then
    delete from public.guest_posts where id = p_id;

  else
    raise exception 'Jenis konten tidak dikenal'
      using errcode = '22023';
  end if;

  if p_kind in ('post', 'comment') and v_post_id is null then
    raise exception 'Konten tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (v_admin, 'content_delete', p_kind, p_id, nullif(btrim(p_reason), ''));

  return v_post_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: nothing new is exposed to clients except the guest write path
-- ---------------------------------------------------------------------------

revoke all on table public.guest_posts from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.moderation_logs from anon, authenticated;

-- `anon` may write exactly two columns into exactly one table. No SELECT, no
-- DELETE, no UPDATE, and no author or image column exists to name.
grant insert (id, content) on table public.guest_posts to anon;
-- Deletion is admin-only, enforced by the policy below.
grant delete on table public.guest_posts to authenticated;

-- Functions default to EXECUTE for PUBLIC, so anon could call these without
-- these explicit revokes.
revoke execute on function public.buat_laporan(uuid, uuid, text, text) from public, anon;
revoke execute on function public.tinjau_laporan(uuid, text) from public, anon;
revoke execute on function public.hapus_konten(text, uuid, text) from public, anon;

grant execute on function public.buat_laporan(uuid, uuid, text, text) to authenticated;
grant execute on function public.tinjau_laporan(uuid, text) to authenticated;
grant execute on function public.hapus_konten(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.guest_posts enable row level security;
-- reports and moderation_logs stay policy-free on purpose: with no policy every
-- role is denied, and there is no grant to bypass it with.
alter table public.reports enable row level security;
alter table public.moderation_logs enable row level security;

create policy "anyone creates guest posts" on public.guest_posts
  for insert to anon
  with check ((select private.guest_post_rate_ok()));

create policy "admins delete guest posts" on public.guest_posts
  for delete to authenticated
  using ((select private.is_admin()));

-- Admins join the delete policies. `auth.uid()` and `user_id` are not referenced
-- here, so the policies stay privilege-clean for a role with no author column
-- grant.
drop policy "owners delete posts" on public.posts;
create policy "owners or admins delete posts" on public.posts
  for delete to authenticated
  using ((select private.owns_post(id)) or (select private.is_admin()));

drop policy "owners delete comments" on public.comments;
create policy "owners or admins delete comments" on public.comments
  for delete to authenticated
  using ((select private.owns_comment(id)) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Same ten columns, same order, same types as v1: `CREATE OR REPLACE VIEW`
-- requires that, and `lib/data/posts.ts` plus the existing tests keep working.
-- Guest rows report `Anonim`, have no image, and can never be `is_mine` because
-- no user owns them.
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

-- Moderation surface. Identifies the real author of anonymous content, which is
-- the one place in the system where that is allowed, and only because this view
-- returns zero rows to anybody who is not an admin.
create or replace view public.admin_reports with (security_invoker = false) as
  select
    r.id,
    r.reason,
    r.description,
    r.status,
    r.created_at,
    r.resolved_at,
    r.post_id,
    r.comment_id,
    case when r.post_id is not null then 'post' else 'comment' end::text as report_type,
    coalesce(p.content, c.content)::text as content_text,
    coalesce(p.anonymous, c.anonymous, true) as content_anonymous,
    coalesce(p.created_at, c.created_at) as content_created_at,
    -- Real author, for moderation. Null when the content is already gone.
    pa.id as content_author_id,
    pa.username as content_author_username,
    ca.id as comment_author_id,
    ca.username as comment_author_username,
    reporter.username as reporter_username,
    resolver.username as resolver_username
  from public.reports r
  left join public.posts p on p.id = r.post_id
  left join public.profiles pa on pa.id = p.user_id
  left join public.comments c on c.id = r.comment_id
  left join public.profiles ca on ca.id = c.user_id
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles resolver on resolver.id = r.resolved_by
  where (select private.is_admin());

-- Guest posts have no report path (a report targets exactly one post or
-- comment), so without this list §3 would introduce unmoderatable content.
create or replace view public.admin_guest_posts with (security_invoker = false) as
  select g.id, g.content, g.created_at
  from public.guest_posts g
  where (select private.is_admin())
  order by g.created_at desc;

revoke all on public.admin_reports from anon;
revoke all on public.admin_guest_posts from anon;

grant select on public.admin_reports to authenticated;
grant select on public.admin_guest_posts to authenticated;

-- ---------------------------------------------------------------------------
-- Public read surface
-- ---------------------------------------------------------------------------

-- BREAKING CHANGE FOR §3: `anon` can now read the feed. The class feed is no
-- longer login-gated. `post_feed` exposes no author column and no report or
-- moderation data, but any unauthenticated visitor can read the class's posts.
-- To re-gate it, drop `anon` from this grant and remove `/feed`, `/buat` and
-- `/post/*` from `PUBLIC_PATHS` in lib/constants.ts.
revoke all on public.post_feed from anon;
grant select on public.post_feed to anon, authenticated;

-- Guests can open a post's thread (read-only). `is_mine` and `liked_by_me` are
-- false for them because `auth.uid()` is null.
revoke all on public.comment_thread from anon;
grant select on public.comment_thread to anon, authenticated;