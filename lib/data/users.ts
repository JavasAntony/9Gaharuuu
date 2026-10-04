import { createClient } from "@/lib/supabase/server";

/**
 * The account list, read through `admin_profiles`.
 *
 * `authenticated` holds no grant on `profiles` at all, so `supabase.from("profiles")`
 * raises 42501 even for an admin. The view is `security definer` and carries
 * `where (select private.is_admin())`, which means a non-admin gets zero rows here rather
 * than an error -- so `requireAdmin()` is what stands between this and an empty list, and
 * the database is what stands between a member and somebody else's account.
 *
 * This is the one place in the system that lists accounts, and the one place the ban
 * columns are read from, so `banned_now` arrives already evaluated by the same expression
 * the write trigger uses (`private.akun_terblokir`). The raw `is_banned` and `banned_until`
 * are kept alongside it because an admin also needs to see that a ban *was* applied, which
 * for an expired ban is the only thing left to look at.
 */
export type AdminProfile = {
  id: string;
  username: string;
  role: "member" | "admin";
  created_at: string;
  is_banned: boolean;
  banned_until: string | null;
  ban_reason: string | null;
  banned_at: string | null;
  banned_by_username: string | null;
  /** The database's own answer to "is this account blocked right now". */
  banned_now: boolean;
  post_count: number;
  comment_count: number;
  like_count: number;
};

const PROFILE_COLUMNS =
  "id, username, role, created_at, is_banned, banned_until, ban_reason, banned_at, banned_by_username, banned_now, post_count, comment_count, like_count";

export async function listProfiles(): Promise<AdminProfile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AdminProfile[];
}