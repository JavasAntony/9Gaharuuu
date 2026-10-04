import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBanActive, type BanState } from "@/lib/bans";

export type SessionUser = {
  id: string;
  username: string | null;
  role: "member" | "admin";
  /**
   * Whether the account is write-blocked right now.
   *
   * Resolved here rather than stored, because `me` returns the two raw columns and the rule
   * that turns them into a yes or a no is the same one `private.akun_terblokir()` applies
   * on the write path -- a temporary ban whose end date has passed is not a ban.
   */
  isBanned: boolean;
  /** Kept so a Client Component can be told how much longer, without re-deriving it. */
  bannedUntil: string | null;
  banReason: string | null;
};

/**
 * The session user, or null when signed out.
 *
 * `getClaims()` verifies the JWT signature on every call, so a forged cookie
 * cannot get past this. `getSession()` is deliberately never used: it reads the
 * cookie without revalidating it.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;

  const { data: profile } = await supabase
    .from("me")
    .select("id, username, role, is_banned, banned_until, ban_reason")
    .maybeSingle();

  const ban: BanState = {
    isBanned: Boolean(profile?.is_banned),
    bannedUntil: (profile?.banned_until as string | null) ?? null,
    banReason: (profile?.ban_reason as string | null) ?? null,
  };

  return {
    id: claims.sub,
    username: profile?.username ?? null,
    role: (profile?.role as SessionUser["role"]) ?? "member",
    isBanned: isBanActive(ban),
    bannedUntil: ban.bannedUntil,
    banReason: ban.banReason,
  };
});

/** Guard for Server Components: signed out users go to /masuk. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk");
  return user;
}

/**
 * Guard for Server Actions. Actions must not redirect, because a redirect
 * thrown from an action is swallowed instead of shown to the caller, so they
 * get an explicit error instead.
 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user.id;
}

/**
 * Admin guard for Server Components.
 *
 * The `role` comes from the `me` view, so it is whatever the database says and
 * not anything the client can assert. This is UX, not the security boundary:
 * every moderation RPC re-checks the role with `private.is_admin()`, so a
 * forged `role` claim in the UI changes nothing.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/akun");
  return user;
}

/** Admin guard for Server Actions. Throws instead of redirecting. */
export async function requireAdminId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user.id;
}

/**
 * Guard for the write actions: a session, and not a write-blocked one.
 *
 * This is not what enforces a ban -- `private.tolak_penulis_terblokir()` raises 42501 on
 * every insert into `posts`, `comments`, `likes` and `guest_likes`, and that is the
 * boundary. This check exists for the one case the trigger cannot help with: a comment or a
 * media post uploads its image *before* the row is written, so a banned member would get
 * past the insert and leave an orphaned object in the bucket that nothing ever points at
 * again.
 *
 * So `BANNED` is a separate code from `UNAUTHENTICATED` rather than a shared message: the
 * two refusals are different facts, and the action shows the right one.
 */
export async function requireWriterId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.isBanned) throw new Error("BANNED");
  return user.id;
}
