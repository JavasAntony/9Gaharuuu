import { createClient } from "@supabase/supabase-js";

/**
 * The service-role client, for the two things Postgres cannot do.
 *
 * Creating and deleting an `auth.users` row is only possible through the Auth Admin API
 * with the secret key. Every other admin operation in this app is an RPC, because RLS can
 * express everything else -- but "make an account" and "remove an account" are statements
 * about `auth.users`, which no policy on a `public` table governs.
 *
 * So this client exists, and it is the one place in `app/` that holds a key that bypasses
 * RLS entirely. Three things keep that survivable:
 *
 *   * It is not `NEXT_PUBLIC_`-prefixed, so it is never inlined into a bundle and never
 *     reaches a browser. The only module that reads it is marked server-side below, and
 *     the callers are all in `app/actions/`, which only ever run on the server.
 *   * Nothing here is called before the database has confirmed the caller is an admin:
 *     `public.periksa_admin()` and `public.periksa_hapus_akun()` run first, over the
 *     caller's own JWT. Asking afterwards would be theatre, because by then the account
 *     would already exist.
 *   * It fails closed. A deploy without the key gets an explicit message on the admin page
 *     rather than a null dereference halfway through a deletion.
 *
 * If you would rather not hold a secret key in the Next process at all, move these two
 * operations into a Supabase Edge Function and keep this file as the client for it. The
 * ordering argument above is unchanged either way -- the check is still first.
 */

/** Thrown instead of constructing a client that would fail later in a less obvious place. */
export const MISSING_SECRET_KEY = "MISSING_SECRET_KEY";

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error(MISSING_SECRET_KEY);

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    // Nothing here is a user session: the key is the identity, and a browser session
    // would only introduce a way for the two to be confused.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}