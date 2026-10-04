import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  username: string | null;
  role: "member" | "admin";
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
    .select("id, username, role")
    .maybeSingle();

  return {
    id: claims.sub,
    username: profile?.username ?? null,
    role: (profile?.role as SessionUser["role"]) ?? "member",
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
