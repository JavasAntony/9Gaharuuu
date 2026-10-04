"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/constants";
import { banSignInMessage, isBanActive, type BanState } from "@/lib/bans";

export type AuthActionState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "Username atau kata sandi salah.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Akun ini belum aktif. Tanya admin kelasmu.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Terlalu banyak percobaan. Coba lagi sebentar.";
  }
  return "Tidak bisa masuk sekarang. Coba lagi nanti.";
}

/**
 * Sign in, then let the ban decide whether the session survives.
 *
 * Supabase Auth knows nothing about a ban -- `profiles.is_banned` is a column in this
 * schema, not an auth setting -- so the password can be perfectly correct and the session
 * still has to be refused. Doing it here rather than in the layout means the member is told
 * *why* on the sign-in screen, with the admin's reason in the message, instead of landing
 * on `/feed`, bouncing to `/akun`, and finding a banner they have to work out the meaning of.
 *
 * The session is signed straight back out. Leaving it open would mean the member sits in the
 * app reading (which the ban does not stop) while every write fails with `42501` from
 * `private.tolak_penulis_terblokir()`, which is a worse experience than being told at the
 * door. Reading is deliberately not blocked: nothing in 0017 restricts it, and a temporary
 * ban that also cut somebody off from the thread they were arguing in would be a different
 * punishment than the one the admin chose.
 */
export async function masuk(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Periksa lagi isianmu.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: `${parsed.data.username}@${SYNTHETIC_EMAIL_DOMAIN}`,
    password: parsed.data.password,
  });

  if (error) return { message: authErrorMessage(error.message) };

  const { data: profile } = await supabase
    .from("me")
    .select("is_banned, banned_until, ban_reason")
    .maybeSingle();

  const ban: BanState = {
    isBanned: Boolean(profile?.is_banned),
    bannedUntil: (profile?.banned_until as string | null) ?? null,
    banReason: (profile?.ban_reason as string | null) ?? null,
  };

  if (isBanActive(ban)) {
    await supabase.auth.signOut();
    return { message: banSignInMessage(ban) };
  }

  // A Server Action can write cookies, so the session established above is
  // persisted by the `setAll` adapter before this redirect is sent.
  redirect("/feed");
}

export async function keluar(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/masuk");
}
