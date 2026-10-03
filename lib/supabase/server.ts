import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// One client per request, so every read and every Server Action write carries
// the signed-in user's JWT and is therefore subject to RLS as that user.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies. The proxy refreshes the
            // session on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
