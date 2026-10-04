# 9Gaharuuu

Private class social platform. Two feeds -- text and media -- with an
anonymity toggle, likes, and one level of threaded comments. Indonesian UI,
Indonesian route segments.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Supabase.

---

## Why the database grants look unusual

This is the part worth reading before you touch `supabase/migrations/`.

**No client — not even an admin — can read `posts.user_id` or `comments.user_id`.**

That guarantee cannot come from RLS. RLS filters **rows**; it has no notion of
columns. An "admins only" SELECT policy would filter authors out of the feed but
would still let any student run `GET /rest/v1/posts?select=user_id` and collect
every author id in the class.

So the guarantee is carried by **privileges**, not policies:

- `authenticated` gets no table-level `SELECT` on any base table. `select=*` fails.
- It gets a **column-level** `SELECT` listing every column *except* the author
  column. Querying `user_id` returns `42501 permission denied for table posts`.
- Reads go through the views `post_feed`, `comment_thread` and `me`, which are
  `security_definer` and therefore run with their owner's rights. They emit an
  anonymized `author_name` and never expose `user_id`.

`npm run test:rls` asserts every one of these claims over HTTP, as real signed-in
users. Do not relax a grant without rerunning it.

### Consequences you will trip over

1. **No `.insert().select()` and no `RETURNING` on a base table.** `RETURNING`
   requires the new row to satisfy the SELECT policy, and column-level grants
   make `select=*` illegal, so these *raise* rather than return an empty array.
   Every mutation generates its own id with `crypto.randomUUID()` and never chains
   `.select()`.
2. **No RLS policy may reference a column the caller cannot read.** A policy
   expression is part of the query, and `SELECT` is required to reference a
   column's value. So the delete policies call `private.owns_post(id)` /
   `private.owns_comment(id)` — `security definer` helpers that resolve ownership
   internally — instead of writing `auth.uid() = user_id`.
3. **Authorship is stamped, never submitted.** `authenticated` has no `INSERT`
   grant on `user_id`, so sending it raises `42501` ("column is write-protected"),
   and a `BEFORE INSERT` trigger fills it from `auth.uid()`.
4. **Mutations filter on `id` only.** `delete().eq("id", …).eq("user_id", …)`
   cannot be written, because the filter itself references a column you cannot
   read. RLS is the real ownership guard, so deleting somebody else's post is a
   silent no-op rather than an error.
5. **A member can only delete their own post through an RPC.** `authenticated`
   has no `DELETE` grant on `posts` and the only policy calls
   `private.is_admin()`, so a self-delete goes through
   `public.hapus_post_saya` (0016) — `security definer`, one branch, ownership
   resolved by `private.owns_post()` — which also writes the row to
   `moderation_logs`. Do not add a grant to shortcut it.
6. **Never `NEXT_PUBLIC_` a secret key.** `SUPABASE_SECRET_KEY` bypasses RLS entirely.
   It is read by `scripts/*.mjs` and, since 0017, by `lib/supabase/admin.ts` — see
   [Admin account management](#admin-account-management) for why, and what happens
   without it.

---

## Bans

A ban is two columns on `profiles` and one expression:

```sql
is_banned and (banned_until is null or banned_until > now())
```

Permanent is `banned_until = null`; temporary is the same row with an end date. Nothing
expires rows and no cron job exists, because "blocked right now" is computed rather than
stored — `private.akun_terblokir()` is the only definition of it, and the trigger, the
views and the app all ask that function rather than re-deriving the rule.

Enforcement is in **Postgres**, not Next.js. `private.tolak_penulis_terblokir()` is a
`BEFORE INSERT` trigger on `posts`, `comments`, `likes` and `guest_likes`, so a banned
member's write is refused with `42501` even from a raw PostgREST call with the publishable
key. The Server Actions check the ban up front with `requireWriterId()` for one reason the
trigger cannot cover: a media post and a comment upload their image *before* the row is
written, so without that check a banned member would get past the insert and leave an
orphaned object in the bucket.

`guest_posts` and `guest_comments` are deliberately **not** covered — they have no author,
so a ban has nothing to attach to, and blocking them would only punish the signed-out
classmates standing next to the banned one.

Reading is not blocked. A banned member can sign in, read the feed, and open any thread;
`masuk` refuses the session only so the reason is shown on the sign-in screen with the
admin's own words in it. `BanBanner` (in `AppShell`) then explains it on every page.

## Announcements

`public.announcements` holds no client grant and no INSERT policy. Every write goes through
a `security definer` RPC that stamps `author_id` from `auth.uid()`, exactly like
`reports` and `moderation_logs`, so an admin cannot publish under somebody else's name.

Two views: `active_announcements` (four columns, no author, readable by `anon` because the
feed is) and `admin_announcements` (everything, gated on `private.is_admin()`). The banner
renders in the `(publik)` layout rather than in each page, so `/feed`, `/media` and
`/post/[id]` cannot disagree about what is currently running.

Archive is the reversible option and the one the manager offers first; deletion asks first.

---

## Admin account management

The admin area is three pages under `/admin`, sharing one layout guard:

| Page | What it does |
| --- | --- |
| `/admin` | the report queue, guest content, and the moderation trail (since 0002) |
| `/admin/pengguna` | create, delete, ban, unban, change role |
| `/admin/pengumuman` | publish, edit, archive, delete announcements |

**Banning, unbanning, role changes and the audit rows are all SQL.** They are
`security definer` functions that re-check `private.is_admin()` internally, and the
Server Action's `requireAdminId()` is only there so the UI can hide what would fail.

**Creating and deleting an account is not.** `auth.users` is only writable through the Auth
Admin API with the secret key, and no policy on a `public` table can gate that. So
`lib/supabase/admin.ts` is the one module in `app/` that holds a key which bypasses RLS,
and the ordering is the whole security argument:

1. `public.periksa_admin()` (or `periksa_hapus_akun`) runs **first**, over the caller's own
   publishable-key JWT, so a member calling the action directly gets nothing.
2. Only then is the secret key picked up and an account created or destroyed.
3. The profile row, the role and the `moderation_logs` entry are written by RPCs that
   re-check the role again.

Asking afterwards would be theatre — the account would already exist. Two custom
SQLSTATEs make the refusals distinguishable without parsing exception text: `P0003` for
naming your own account, and `P0004` for refusing to ban or demote the last admin who is
not already banned, so the class cannot lock itself out of its own moderation area.

**Without `SUPABASE_SECRET_KEY` in the server environment, account creation and deletion
report that plainly instead of failing obscurely.** Everything else on the admin pages
keeps working, because it is all RPCs.

If you would rather not hold a secret key in the Next process at all, move those two
operations into a Supabase Edge Function and point `lib/supabase/admin.ts` at it. The
ordering argument is unchanged.

---

## Resetting the content

Accounts are never touched by a reset. Two ways, depending on what you need:

```bash
npm run reset:content              # report the row and file counts, change nothing
npm run reset:content -- --yes     # clear them
npm run reset:content -- --yes --storage-only   # clear the bucket, keep the rows
```

Or, for the database half alone, paste `supabase/reset_content.sql` into the Supabase SQL
editor. The Node script exists because **storage objects are files, not rows**: deleting
from `storage.objects` inside a transaction removes the record and leaves the file in the
bucket, so the bucket would claim to be empty and still serve every old image. Only the
Storage API actually unlinks a file — the same reason `hapusPost` removes an image over
HTTP rather than from a cascade.

There are no sequences to reset: every primary key in this schema is
`uuid default gen_random_uuid()`. The SQL file still says `RESTART IDENTITY` so a future
`serial` column would not silently continue from where it left off.

---

## Prerequisites

- Node.js **>= 22** (`@supabase/supabase-js` requires it; Next 16 needs >= 20.9)
- A hosted Supabase project
- The Supabase CLI, available as the local `supabase` devDependency (`npx supabase …`)

## 1. Environment

```bash
cp .env.example .env.local
```

Fill in the three values from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
```

`SUPABASE_URL` is accepted as an alias for the first one (that is what
`supabase link` writes). `.env.local` is gitignored; `.env.example` is committed.

## 2. Auth settings

In **Authentication → Sign In / Providers → Email**:

- turn **off** "Allow new users to sign up" — v1 has no register page
- set **Site URL** to `http://localhost:3000`

## 3. Database

```bash
npx supabase login          # interactive; run it in a real terminal
npx supabase link --project-ref <ref>
npm run db:push
```

`db:push` applies `supabase/migrations/*.sql` in order. It does not need Docker.

### Verify the definer views

The views bypass RLS only if their owner has `BYPASSRLS`. Run this once in
the Supabase SQL editor after `db push`:

```sql
select c.relname, pg_get_userbyid(c.relowner) as owner, r.rolbypassrls
from pg_class c
join pg_roles r on r.oid = c.relowner
where c.relname in ('post_feed', 'comment_thread', 'me', 'active_announcements',
                    'admin_profiles', 'admin_announcements');
```

All six need it, including `active_announcements`: `announcements` has RLS enabled with no
policies, so a view owner without `BYPASSRLS` would see nothing and the feed would look
like it simply had no announcements.

If `rolbypassrls` is false, run `alter view public.<name> owner to postgres;`.
`npm run test:rls` catches this too — the views simply return no rows otherwise.

If PostgREST answers `PGRST205` / 404 for a table that clearly exists, its schema
cache is stale: `NOTIFY pgrst, 'reload schema';`

## 4. Accounts

```bash
npm run seed:users                    # SEED_PASSWORD=… to override
```

Creates the admin plus three classmates, prints the credentials, and is safe to
re-run. Usernames live in the `ACCOUNTS` array at the top of
`scripts/seed-users.mjs` — edit it to match your class.

Auth identity is a synthetic email `{username}@kelaskita.local`. The login screen
asks for a username and a password only; the Server Action builds the address
server-side, so no student ever sees or types an email.

## 5. Run

```bash
npm run dev
```

`/` redirects to `/feed`. Signed-out requests to `/feed` redirect to `/masuk`.

## 6. Checks

```bash
npm run typecheck
npm run lint
npm run build
npm run test:rls        # signs in as throwaway users and asserts allow/deny over HTTP
```

`test:rls` creates `test_a` and `test_b`, exercises every allow/deny path, then
deletes both users (cascading away all their content), so it is repeatable. It
exits non-zero on the first failure and prints the raw PostgREST error.

---

## How a request flows

```
Browser ──► Next.js (Vercel)
             ├─ proxy.ts            refresh the Supabase session (auth.getClaims)
             ├─ Server Components   read  → post_feed / comment_thread / me
             └─ Server Actions      write → posts / comments / likes
                                    └─ Supabase: Auth, Postgres, RLS
```

Reads and writes both use the **publishable** key with the signed-in user's JWT, so
RLS is the only thing between a student and the database. The secret key is used by
`scripts/*.mjs`, and by `lib/supabase/admin.ts` for the two operations RLS cannot
express — see [Admin account management](#admin-account-management).

- `proxy.ts` (Next 16's name for middleware) refreshes the access token on every
  request and returns the response built by `setAll`, so refreshed cookies reach
  the browser. Its redirect is an optimistic gate only.
- `lib/auth.ts` is the real guard: `getClaims()` verifies the JWT signature on
  every call, and `getSession()` is never used because it reads the cookie without
  revalidating it.
- `lib/data/*.ts` are the only modules that read tables or views.
- Server Actions never accept `user_id` from a form; the database stamps it.
- Pages read cookies, so they are dynamic. `cacheComponents` stays off and user
  data is never wrapped in `use cache`.
- Relative time is computed in the Server Component and passed down as a string;
  computing it on the client causes hydration mismatches.

## Route map

| Route | Purpose |
| --- | --- |
| `/masuk` | public login (username + password) |
| `/feed` | the text feed: posts with words and no picture |
| `/media` | the media feed: posts that carry a picture |
| `/post/[id]` | one post plus its comment thread |
| `/akun` | current username, role, sign out |
| `/admin` | report queue, guest content, moderation trail |
| `/admin/pengguna` | create, delete, ban, unban, change role |
| `/admin/pengumuman` | publish, edit, archive, delete announcements |

## Two feeds, one column

There is no `feed` column on `posts`. The two lists are separated by
`image_url`: `/feed` selects `image_url is null`, `/media` selects
`image_url is not null`, and those two filters partition every row exactly
once. Nothing can drift out of sync because there is no second piece of
state to keep in step.

What the column cannot express is what each route will *accept* -- both
shapes are legal rows -- so the route is enforced in the action as well as
in the composer. `buatPostTeks` refuses a file, `buatPostMedia` refuses to
run without one, and `PostComposer` renders the picker for one feed only.
`guest_posts` grants INSERT on `(id, content)` and has no image column, so
guests can only ever write to the text feed; `/media` says so instead of
offering an upload that would be refused.

Comments are not posts. A reply may be text, text plus a picture, or a
picture alone, under either feed.

## Deployment (Vercel)

1. Push this repo to GitHub and import it in Vercel. The build command is
   `npm run build`; no framework preset override is needed (Next.js is detected).
2. Add these environment variables:

   | Variable | Required | Why |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | yes | every read and write |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | every read and write |
   | `SUPABASE_SECRET_KEY` | **for `/admin/pengguna`** | creating and deleting an `auth.users` row is only possible through the Auth Admin API, which needs the secret key |

   Never prefix the secret key with `NEXT_PUBLIC_` — that would ship it to every browser.

   `SUPABASE_SECRET_KEY` **bypasses RLS entirely**, which is the one guarantee this whole
   schema exists for, so it is worth being deliberate about it:

   - Without it, `/admin/pengguna` reports plainly that the feature needs it and everything
     else on the admin pages keeps working (they are all RPCs). Ban, unban and role changes
     need no secret key at all.
   - To keep it out of the Next process entirely, move account creation and deletion into a
     Supabase Edge Function that holds the key as its own service-role secret, and point
     `lib/supabase/admin.ts` at it. The "check the admin first, then pick up the key"
     ordering is the same either way.
3. Deploy.
4. Set the Supabase **Auth → URL Configuration → Redirect URLs** to include your
   Vercel domain.
5. Post-deploy checks:
   ```bash
   # point .env.local at production, then:
   npm run test:rls
   ```
   All 94 assertions should pass against the live database. They exercise the
   database and the publishable key, so they are the same checks whether you run
   them locally or in production.
6. Open the deployed URL on a phone and walk the flow by hand: sign in, post
   anonymously, confirm the feed shows `Anonim`, like, comment, reply, delete.

