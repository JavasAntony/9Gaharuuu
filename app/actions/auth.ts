"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/constants";

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

  // A Server Action can write cookies, so the session established above is
  // persisted by the `setAll` adapter before this redirect is sent.
  redirect("/feed");
}

export async function keluar(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/masuk");
}
