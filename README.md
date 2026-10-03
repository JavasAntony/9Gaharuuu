# KelasKita v1

Private class social platform. Text posts with an anonymity toggle, likes, and
one level of threaded comments. Indonesian UI, Indonesian route segments.

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
5. **Never `NEXT_PUBLIC_` a secret key**, and keep `SUPABASE_SECRET_KEY` out of
   Vercel for v1. It is read only by `scripts/*.mjs`.

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

The three views bypass RLS only if their owner has `BYPASSRLS`. Run this once in
the Supabase SQL editor after `db push`:

```sql
select c.relname, pg_get_userbyid(c.relowner) as owner, r.rolbypassrls
from pg_class c
join pg_roles r on r.oid = c.relowner
where c.relname in ('post_feed', 'comment_thread', 'me');
```

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
RLS is the only thing between a student and the database. The secret key is used
only by `scripts/*.mjs`.

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
| `/feed` | the feed, keyset paginated |
| `/buat` | compose a post |
| `/post/[id]` | one post plus its comment thread |
| `/akun` | current username, role, sign out |

## Deployment (Vercel)

1. Push this repo to GitHub and import it in Vercel. The build command is
   `npm run build`; no framework preset override is needed (Next.js is detected).
2. Add **exactly two** environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Do **not** add `SUPABASE_SECRET_KEY`. No app code reads it; only
   `scripts/*.mjs` do, and those never run on Vercel. A leaked secret key would
   bypass RLS entirely, which is the one guarantee this whole schema exists for.
3. Deploy.
4. Set the Supabase **Auth → URL Configuration → Redirect URLs** to include your
   Vercel domain.
5. Post-deploy checks:
   ```bash
   # point .env.local at production, then:
   npm run test:rls
   ```
   All 27 assertions should pass against the live database. They exercise the
   database and the publishable key, so they are the same checks whether you run
   them locally or in production.
6. Open the deployed URL on a phone and walk the flow by hand: sign in, post
   anonymously, confirm the feed shows `Anonim`, like, comment, reply, delete.

