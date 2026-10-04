-- KelasKita v2: bans, announcements, and admin user management.
--
-- Until now `profiles.role` was written exactly once, by `scripts/seed-users.mjs` with
-- the secret key, and the admin area could only moderate content. This migration adds the
-- three things that were missing: a way to stop an account without deleting it, a way to
-- broadcast something to the whole class, and an admin surface that manages accounts.
--
-- The rules from 0001 still hold, and this migration is written to keep them:
--
--   * `authenticated` still has no grant on `profiles`. A plain
--     `supabase.from("profiles").select()` from a Server Action raises 42501, so the
--     account list is a definer view exactly like `admin_reports` is.
--   * No RLS policy or trigger may reference a column the caller cannot read, so the ban
--     checks go through `private` definer helpers that take only the caller's uuid.
--   * `RETURNING` still raises under column-level grants, so nothing here mutates a base
--     table from the client.
--
-- Three new ideas:
--
-- 1. A BAN IS A COLUMN STATE, NOT A ROW STATE. `is_banned` plus a nullable `banned_until`
--    is one flag, not two modes: a temporary ban is the same row with an end date, so
--    "is this account write-blocked right now" is one expression evaluated everywhere
--    instead of a cron job that has to expire rows. See `private.akun_terblokir()`.
--
-- 2. THE BAN IS ENFORCED IN POSTGRES, NOT IN NEXT.JS. A trigger on every member-owned
--    write table refuses the insert with 42501 before the row exists, so a raw PostgREST
--    call with the publishable key is refused too. The Server Actions map that code to an
--    Indonesian message, but they are the courtesy, not the boundary -- the same argument
--    as the guest flood guards in 0002.
--
-- 3. ACCOUNT CREATION AND DELETION CANNOT BE SQL. `auth.users` is only writable through
--    the Auth Admin API with the secret key, so `public.simpan_akun_baru` and
--    `public.catat_hapus_akun` do the part Postgres owns -- profile row, role, and audit
--    trail -- and the Server Action in `app/actions/users.ts` does the auth call around
--    them. The order matters and is argued in the comments on each function: the admin
--    check runs *before* the destructive or additive call, because by the time the RPC
--    refuses, the account would already exist.

-- ===========================================================================
-- SQLSTATEs introduced here
-- ===========================================================================
--
-- The app reads SQLSTATEs, never exception text, because text is what somebody edits in a
-- future migration without noticing what depends on it. `42501` is already taken across the
-- schema for "the database refused you", which is not specific enough for two refusals that
-- matter here:
--
--   * `P0003` -- the caller named their own account. An admin deleting or demoting
--     themselves locks the class out of its own moderation area with nobody able to undo
--     it, so it is refused rather than allowed and regretted. Distinct from `42501` because
--     "you are not an admin" and "you may not do that to yourself" are different facts and
--     the message shown has to tell them apart.
--   * `P0004` -- refusing to lock the class out of itself. Banning or demoting the last
--     unbanned admin would leave nobody able to lift the resulting ban.
--
-- Both live in the `P` class, which is the class PL/pgSQL reserves for `raise_exception`,
-- and PostgREST passes them through in the `code` field exactly as it does `P0002`.

-- ---------------------------------------------------------------------------
-- 1. Ban columns on profiles
-- ---------------------------------------------------------------------------

-- `is_banned` is the switch and `banned_until` is the optional end of it. A permanent ban
-- is `is_banned = true, banned_until = null`; a 7-day ban is the same row with a date.
-- There is no third mode and no "expired" state to reconcile, because an expired temporary
-- ban is simply `is_banned = true` with a `banned_until` in the past, which every reader
-- treats as not banned.
--
-- `banned_by` is nullable with `on delete set null` for the same reason `moderation_logs
-- .admin_id` became nullable in 0006: an audit column must outlive the account it names.
-- An admin who bans someone and is later deleted must not erase the fact that they did.
alter table public.profiles
  add column is_banned boolean not null default false,
  add column banned_until timestamptz,
  add column ban_reason text check (ban_reason is null or char_length(ban_reason) <= 500),
  add column banned_at timestamptz,
  add column banned_by uuid references public.profiles (id) on delete set null;

-- No index on the ban columns, which is a deliberate omission rather than an oversight.
-- Every query that reads them goes through `admin_profiles`, which returns zero rows to a
-- non-admin and lists the whole class otherwise -- so the plan is a sequential scan over a
-- table with one row per classmate, and a partial index on `is_banned` could only ever cover
-- the handful of frozen accounts while still being written on every ban and unban. The same
-- reasoning is why `admin_reports` has no index of its own.

-- ---------------------------------------------------------------------------
-- 2. The effective-ban expression
-- ---------------------------------------------------------------------------

-- One definition of "write-blocked right now", used by the trigger, the views and the app.
--
-- `security definer` because policy and trigger expressions run as the calling role, which
-- has no SELECT on `profiles`; `set search_path = ''` keeps it unspoofable. Null in, null
-- out: a signed-out caller has no ban, which is what keeps `anon` -- and therefore the
-- guest flood guards -- unaffected by any account's state.
--
-- This is the function the whole ban system rests on. Anything that asks "may this account
-- write?" asks it here rather than re-deriving the two-column rule, because the failure
-- mode of a second derivation is a ban that quietly stopped applying to one table.
create or replace function private.akun_terblokir(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_banned
      and (p.banned_until is null or p.banned_until > now())
  );
$$;

-- The same question about the caller, as the triggers below phrase it. Kept separate from
-- `akun_terblokir` so a trigger never has to pass `auth.uid()` by hand: the id comes from
-- the JWT and cannot be substituted by the row being written.
create or replace function private.penulis_terblokir()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.akun_terblokir((select auth.uid())), false);
$$;

-- ---------------------------------------------------------------------------
-- 3. Enforcement: one trigger on every member-owned write table
-- ---------------------------------------------------------------------------

-- Raises 42501 ("insufficient privilege") with a message the action layer can pass
-- through, because 42501 is the code the app already reads as "the database refused you".
--
-- It is a trigger rather than an RLS `with check` for the reason the delete policies call
-- `private.owns_post()` instead of writing `auth.uid() = user_id`: a check expression is
-- part of the query and cannot reference a column the caller cannot read, and
-- `profiles.is_banned` is exactly such a column. A trigger reads it as the definer.
--
-- The four tables are the member-owned ones. `guest_posts` and `guest_comments` are
-- deliberately absent: they have no author, so a ban has nothing to attach to and
-- blocking them would only punish the signed-out classmates standing next to the banned
-- one.
create or replace function private.tolak_penulis_terblokir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.penulis_terblokir()) then
    raise exception 'Akun sedang dibekukan, jadi tidak bisa menulis dulu.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger posts_tolak_terblokir
  before insert on public.posts
  for each row execute function private.tolak_penulis_terblokir();

create trigger comments_tolak_terblokir
  before insert on public.comments
  for each row execute function private.tolak_penulis_terblokir();

create trigger likes_tolak_terblokir
  before insert on public.likes
  for each row execute function private.tolak_penulis_terblokir();

create trigger guest_likes_tolak_terblokir
  before insert on public.guest_likes
  for each row execute function private.tolak_penulis_terblokir();

-- ---------------------------------------------------------------------------
-- 4. Announcements
-- ---------------------------------------------------------------------------

-- No client grant and no INSERT policy: every write goes through a definer RPC that
-- stamps `author_id` from `auth.uid()`, so an admin cannot put somebody else's name on an
-- announcement. This is the `reports` / `moderation_logs` arrangement from 0002, unchanged.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 1000),
  -- Nullable with `on delete set null`: an announcement outlives the admin who wrote it,
  -- and it should keep rendering when that account is deleted.
  author_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial, because the only query the public surface ever runs is "the active ones, newest
-- first". An archived announcement leaves the index immediately, which is the whole point
-- of archiving it.
create index announcements_active_idx on public.announcements (created_at desc, id desc)
  where is_active;

create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function private.touch_updated_at();

alter table public.announcements enable row level security;
-- No policies: with RLS enabled and no policy, every role is denied, and there is no grant
-- to bypass it with.

-- ---------------------------------------------------------------------------
-- 5. The moderation log vocabulary grows
-- ---------------------------------------------------------------------------

-- Two new target types and ten new actions. The check is a closed list on purpose --
-- it is what makes `moderation_logs` readable: the dashboard can render a label for every
-- value the column can hold, and a typo becomes a failed insert instead of a row that says
-- `annoucement_creat` in the audit trail forever.
alter table public.moderation_logs drop constraint moderation_logs_action_check;

alter table public.moderation_logs
  add constraint moderation_logs_action_check
  check (
    action in (
      'report_review', 'report_resolve', 'report_dismiss', 'content_delete', 'post_self_delete',
      'user_create', 'user_delete', 'user_ban', 'user_unban', 'user_role_change',
      'announcement_create', 'announcement_update',
      'announcement_activate', 'announcement_archive', 'announcement_delete'
    )
  );

alter table public.moderation_logs drop constraint moderation_logs_target_type_check;

alter table public.moderation_logs
  add constraint moderation_logs_target_type_check
  check (
    target_type in (
      'post', 'comment', 'guest_post', 'guest_comment', 'report', 'user', 'announcement'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. The admin gate, exposed
-- ---------------------------------------------------------------------------

-- `private.is_admin()` answers the question for a policy expression. This answers it for a
-- Server Action that is about to call the Auth Admin API with the secret key, which is a
-- capability no RLS policy can gate: by the time a PostgREST call is made, the key in hand
-- is already the secret one.
--
-- So the action asks the database first, before creating or deleting anything, and only
-- then picks up the secret key. Asking afterwards would be theatre -- the account would
-- already exist. This is the one place the two halves of the system meet, and the ordering
-- is the whole security argument.
--
-- `stable`: it reads, it does not write. Revocable in one line, like every other function
-- here.
create or replace function public.periksa_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa mengelola akun'
      using errcode = '42501';
  end if;

  return (select auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Account management RPCs
-- ---------------------------------------------------------------------------

-- Confirm an account exists before the Auth Admin API deletes it. Answers with the
-- username so the audit row written afterwards is attributed even though the profile row
-- is already gone by then.
--
-- The self-check is here and not only in `catat_hapus_akun` below for the same reason the
-- admin check is separate: this one runs *before* something irreversible. An admin who
-- deletes their own account leaves nobody who can undo it, so it is refused with `P0003`
-- rather than allowed and regretted.
create or replace function public.periksa_hapus_akun(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa menghapus akun'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Kamu tidak bisa menghapus akun sendiri'
      using errcode = 'P0003';
  end if;

  select pr.username into v_username
  from public.profiles pr
  where pr.id = p_user_id;

  -- Nothing is leaked by saying so: the caller is an admin and can read every account
  -- through `admin_profiles` regardless. The branch exists so a duplicated tap answers
  -- "already gone" instead of carrying on to an Auth API call for an id that is not there.
  if not found then
    raise exception 'Akun tidak ditemukan'
      using errcode = 'P0002';
  end if;

  return v_username;
end;
$$;

-- The audit half of an account deletion, called *after* the Auth Admin API has removed the
-- user and the cascade has taken the profile, posts, comments and likes with it.
--
-- `target_id` has no foreign key, which is the only reason this can be written at all: by
-- this point the row it names does not exist, and that is the correct state for the audit
-- trail to describe. The username travels as an argument for the same reason -- the profile
-- that held it is gone.
--
-- The guards repeat on purpose. This is the only writer of the row, so it re-checks that
-- the caller is an admin and is not the account that was deleted, rather than trusting
-- that the action called the other function first.
create or replace function public.catat_hapus_akun(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa menghapus akun'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Akun sendiri tidak bisa dicatat sebagai terhapus'
      using errcode = 'P0003';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    'user_delete',
    'user',
    p_user_id,
    nullif(btrim(p_username), '')
  );
end;
$$;

-- Write the profile half of an account an admin just created through the Auth Admin API.
--
-- The `on_auth_user_created` trigger has already made the profile by this point, with role
-- `member`, so this is an upsert rather than an insert: it applies the requested role, and
-- it repairs the case of an account that somehow has no profile row at all.
--
-- A username that is already taken is caught earlier than it looks: the auth insert fires
-- `on_auth_user_created` first, and `private.handle_new_user()` uses `on conflict (id)`, so a
-- clash on the username index is *not* swallowed and fails the whole account creation. The
-- action never reaches this function with a duplicate, and if it somehow did the `23505`
-- from the index below would say the same thing.
create or replace function public.simpan_akun_baru(
  p_user_id uuid,
  p_username text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa membuat akun'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'ID akun tidak valid'
      using errcode = '22023';
  end if;

  if p_username is null or p_username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'Username tidak valid'
      using errcode = '22023';
  end if;

  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'Peran tidak dikenal'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, username, role)
  values (p_user_id, p_username, p_role)
  on conflict (id) do update
    set username = excluded.username,
        role = excluded.role,
        updated_at = now();

  -- Written after the upsert so a duplicate username leaves no audit row claiming an
  -- account was created.
  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    'user_create',
    'user',
    p_user_id,
    p_role
  );
end;
$$;

-- Block or unblock an account.
--
-- `p_sampai` null is a permanent ban and a timestamp is a temporary one -- one column, one
-- row, no mode flag. The end date has to be in the future: a ban that is already over is
-- not a ban, and accepting it would leave the dashboard showing a ban that the database
-- does not honour, which is the kind of disagreement that gets somebody in trouble.
--
-- The last-admin guard counts *unbanned* admins other than the target, so the class cannot
-- be locked out of its own moderation area by banning or demoting every admin in turn. It
-- only applies when the target is an admin; banning a member needs no such arithmetic.
create or replace function public.blokir_akun(
  p_user_id uuid,
  p_sampai timestamptz,
  p_alasan text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa memblokir akun'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Kamu tidak bisa memblokir akun sendiri'
      using errcode = 'P0003';
  end if;

  if p_sampai is not null and p_sampai <= now() then
    raise exception 'Waktu blokir harus di masa depan'
      using errcode = '22023';
  end if;

  if p_alasan is not null and char_length(p_alasan) > 500 then
    raise exception 'Alasan terlalu panjang'
      using errcode = '22023';
  end if;

  select pr.role into v_role from public.profiles pr where pr.id = p_user_id;

  if v_role is null then
    raise exception 'Akun tidak ditemukan'
      using errcode = 'P0002';
  end if;

  if v_role = 'admin' and (
    select count(*) from public.profiles pr
    where pr.role = 'admin'
      and pr.id <> p_user_id
      and not private.akun_terblokir(pr.id)
  ) < 1 then
    raise exception 'Ini admin terakhir yang masih aktif, jadi tidak bisa diblokir.'
      using errcode = 'P0004';
  end if;

  update public.profiles
  set is_banned = true,
      banned_until = p_sampai,
      ban_reason = nullif(btrim(p_alasan), ''),
      banned_at = now(),
      banned_by = (select auth.uid()),
      updated_at = now()
  where id = p_user_id;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    'user_ban',
    'user',
    p_user_id,
    nullif(btrim(p_alasan), '')
  );
end;
$$;

-- Lift a ban early. Clearing `banned_until` as well as the flag is the point: a temporary
-- ban that was served half way has to stop applying immediately, and leaving the date
-- behind would make the audit row and the profile disagree about what the account is.
create or replace function public.buka_blokir_akun(p_user_id uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa membuka blokir'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Kamu tidak bisa membuka blokir akun sendiri'
      using errcode = 'P0003';
  end if;

  if p_alasan is not null and char_length(p_alasan) > 500 then
    raise exception 'Alasan terlalu panjang'
      using errcode = '22023';
  end if;

  update public.profiles
  set is_banned = false,
      banned_until = null,
      ban_reason = null,
      banned_at = null,
      banned_by = null,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Akun tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    'user_unban',
    'user',
    p_user_id,
    nullif(btrim(p_alasan), '')
  );
end;
$$;

-- Move an account between `member` and `admin`.
--
-- Refuses to demote the last unbanned admin, for the same reason `blokir_akun` refuses to
-- ban one: the class would have nobody who can lift the resulting lockout. Self-demotion
-- is refused outright, since an admin who can demote themselves can lock themselves out
-- with one tap and there is no second admin to undo it.
create or replace function public.ubah_peran_akun(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa mengubah peran'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Kamu tidak bisa mengubah peran sendiri'
      using errcode = 'P0003';
  end if;

  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'Peran tidak dikenal'
      using errcode = '22023';
  end if;

  select pr.role into v_role from public.profiles pr where pr.id = p_user_id;

  if v_role is null then
    raise exception 'Akun tidak ditemukan'
      using errcode = 'P0002';
  end if;

  if v_role = 'admin' and p_role = 'member' and (
    select count(*) from public.profiles pr
    where pr.role = 'admin'
      and pr.id <> p_user_id
      and not private.akun_terblokir(pr.id)
  ) < 1 then
    raise exception 'Ini admin terakhir yang masih aktif, jadi tidak bisa diturunkan.'
      using errcode = 'P0004';
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    'user_role_change',
    'user',
    p_user_id,
    v_role || ' -> ' || p_role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Announcement RPCs
-- ---------------------------------------------------------------------------

-- One writer per transition, each of which logs itself, so the dashboard can never show an
-- announcement state that the audit trail does not explain. None of them accepts an author
-- or a timestamp: `author_id` comes from `auth.uid()` and the columns from the defaults.
create or replace function public.buat_pengumuman(p_judul text, p_isi text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa membuat pengumuman'
      using errcode = '42501';
  end if;

  if p_judul is null or btrim(p_judul) = '' or char_length(btrim(p_judul)) > 120 then
    raise exception 'Judul pengumuman tidak valid'
      using errcode = '22023';
  end if;

  if p_isi is null or btrim(p_isi) = '' or char_length(btrim(p_isi)) > 1000 then
    raise exception 'Isi pengumuman tidak valid'
      using errcode = '22023';
  end if;

  insert into public.announcements (title, content, author_id)
  values (btrim(p_judul), btrim(p_isi), (select auth.uid()))
  returning id into v_id;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values ((select auth.uid()), 'announcement_create', 'announcement', v_id, btrim(p_judul));

  return v_id;
end;
$$;

-- Editing the text is a different action from archiving it, because the two answer
-- different questions in the trail: "what did the class read" and "what is the class being
-- shown now". A single `announcement_update` row would answer neither.
create or replace function public.ubah_pengumuman(p_id uuid, p_judul text, p_isi text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa mengubah pengumuman'
      using errcode = '42501';
  end if;

  if p_judul is null or btrim(p_judul) = '' or char_length(btrim(p_judul)) > 120 then
    raise exception 'Judul pengumuman tidak valid'
      using errcode = '22023';
  end if;

  if p_isi is null or btrim(p_isi) = '' or char_length(btrim(p_isi)) > 1000 then
    raise exception 'Isi pengumuman tidak valid'
      using errcode = '22023';
  end if;

  update public.announcements
  set title = btrim(p_judul),
      content = btrim(p_isi),
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Pengumuman tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values ((select auth.uid()), 'announcement_update', 'announcement', p_id, btrim(p_judul));
end;
$$;

-- Archive or unarchive. Two action names for one toggle, chosen from the new state, so the
-- trail reads as what happened rather than as a request.
create or replace function public.toggle_pengumuman(p_id uuid, p_aktif boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa mengubah pengumuman'
      using errcode = '42501';
  end if;

  update public.announcements
  set is_active = coalesce(p_aktif, false),
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Pengumuman tidak ditemukan'
      using errcode = 'P0002';
  end if;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (
    (select auth.uid()),
    case when coalesce(p_aktif, false) then 'announcement_activate' else 'announcement_archive' end,
    'announcement',
    p_id,
    null
  );
end;
$$;

-- Permanent removal, for a typo or an announcement nobody should ever have seen. Archiving
-- is the reversible option and the one the dashboard offers first; this is the one behind a
-- confirmation.
create or replace function public.hapus_pengumuman(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_judul text;
begin
  if not (select private.is_admin()) then
    raise exception 'Hanya admin yang bisa menghapus pengumuman'
      using errcode = '42501';
  end if;

  select a.title into v_judul from public.announcements a where a.id = p_id;

  if not found then
    raise exception 'Pengumuman tidak ditemukan'
      using errcode = 'P0002';
  end if;

  delete from public.announcements where id = p_id;

  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values ((select auth.uid()), 'announcement_delete', 'announcement', p_id, v_judul);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

revoke all on table public.announcements from anon, authenticated;

-- Functions default to EXECUTE for PUBLIC, so anon could call these without these
-- explicit revokes. All of them are admin-only and all of them write to a table that is
-- itself grant-free.
revoke execute on function public.periksa_admin() from public, anon;
revoke execute on function public.periksa_hapus_akun(uuid) from public, anon;
revoke execute on function public.catat_hapus_akun(uuid, text) from public, anon;
revoke execute on function public.simpan_akun_baru(uuid, text, text) from public, anon;
revoke execute on function public.blokir_akun(uuid, timestamptz, text) from public, anon;
revoke execute on function public.buka_blokir_akun(uuid, text) from public, anon;
revoke execute on function public.ubah_peran_akun(uuid, text) from public, anon;
revoke execute on function public.buat_pengumuman(text, text) from public, anon;
revoke execute on function public.ubah_pengumuman(uuid, text, text) from public, anon;
revoke execute on function public.toggle_pengumuman(uuid, boolean) from public, anon;
revoke execute on function public.hapus_pengumuman(uuid) from public, anon;

grant execute on function public.periksa_admin() to authenticated;
grant execute on function public.periksa_hapus_akun(uuid) to authenticated;
grant execute on function public.catat_hapus_akun(uuid, text) to authenticated;
grant execute on function public.simpan_akun_baru(uuid, text, text) to authenticated;
grant execute on function public.blokir_akun(uuid, timestamptz, text) to authenticated;
grant execute on function public.buka_blokir_akun(uuid, text) to authenticated;
grant execute on function public.ubah_peran_akun(uuid, text) to authenticated;
grant execute on function public.buat_pengumuman(text, text) to authenticated;
grant execute on function public.ubah_pengumuman(uuid, text, text) to authenticated;
grant execute on function public.toggle_pengumuman(uuid, boolean) to authenticated;
grant execute on function public.hapus_pengumuman(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Views
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE VIEW may only append columns, so `me` keeps its v1 order -- id, username,
-- role, created_at -- and gains the ban state at the end. `lib/auth.ts` selects its columns by
-- name, so nothing on the app side had to change.
--
-- `is_banned` is reported raw rather than as "banned right now", because the two differ
-- once a temporary ban expires and this view would then be showing a stale answer. The
-- caller applies the same rule `private.akun_terblokir()` does: banned, and either no end
-- date or an end date in the future.
create or replace view public.me with (security_invoker = false) as
  select
    pr.id,
    pr.username,
    pr.role,
    pr.created_at,
    pr.is_banned,
    pr.banned_until,
    pr.ban_reason
  from public.profiles pr
  where pr.id = (select auth.uid());

-- The account list. Needs a definer view for the reason `me` does: `authenticated` has no
-- grant on `profiles`, so a direct select raises 42501.
--
-- `banned_now` is the effective-ban expression inlined so the dashboard does not have to
-- re-derive it and cannot drift from the trigger. The raw columns stay because an admin
-- also needs to see that a ban *was* applied and when it ends, which for an expired ban is
-- the only interesting thing left.
--
-- The counts are here rather than in the app so the page is one query. They cost three
-- correlated subqueries per row over a class-sized table, which is the right trade for a
-- list of under a few hundred accounts.
create or replace view public.admin_profiles with (security_invoker = false) as
  select
    pr.id,
    pr.username,
    pr.role,
    pr.created_at,
    pr.is_banned,
    pr.banned_until,
    pr.ban_reason,
    pr.banned_at,
    author.username as banned_by_username,
    (pr.is_banned and (pr.banned_until is null or pr.banned_until > now())) as banned_now,
    (select count(*) from public.posts po where po.user_id = pr.id)::int as post_count,
    (select count(*) from public.comments c where c.user_id = pr.id)::int as comment_count,
    (select count(*) from public.likes l where l.user_id = pr.id)::int as like_count
  from public.profiles pr
  left join public.profiles author on author.id = pr.banned_by
  where (select private.is_admin());

-- What every reader sees. `anon` included, because /feed and /media are readable without
-- an account and an announcement is class-wide news rather than a moderation message.
--
-- No `author_id` and no `is_active`: the public surface is exactly the fields that get
-- rendered, so there is nothing here to widen later without noticing. `is_active` is in
-- the `WHERE` instead, which is why this view and `admin_announcements` cannot disagree
-- about which announcements are running.
create or replace view public.active_announcements with (security_invoker = false) as
  select
    a.id,
    a.title,
    a.content,
    a.created_at
  from public.announcements a
  where a.is_active
  order by a.created_at desc, a.id desc;

-- The manager's view: everything, including archived and who wrote it.
create or replace view public.admin_announcements with (security_invoker = false) as
  select
    a.id,
    a.title,
    a.content,
    a.is_active,
    a.created_at,
    a.updated_at,
    a.author_id,
    pr.username as author_username
  from public.announcements a
  left join public.profiles pr on pr.id = a.author_id
  where (select private.is_admin());

revoke all on public.admin_profiles from anon;
revoke all on public.admin_announcements from anon;

grant select on public.admin_profiles to authenticated;
grant select on public.admin_announcements to authenticated;

grant select on public.active_announcements to anon, authenticated;