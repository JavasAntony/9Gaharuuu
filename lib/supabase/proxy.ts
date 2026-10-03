import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Nothing may run between createServerClient and getClaims(): a refresh that
  // races with a second refresh revokes the whole session.
  const { data } = await supabase.auth.getClaims();

  // This is an optimistic gate only. The real check is requireUser() in
  // app/(app)/layout.tsx and in every Server Action.
  if (!data?.claims && !request.nextUrl.pathname.startsWith("/masuk")) {
    const url = request.nextUrl.clone();
    url.pathname = "/masuk";
    url.search = "";

    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header);
      if (value) redirectResponse.headers.set(header, value);
    }
    return redirectResponse;
  }

  // The response built by setAll carries the refreshed cookies. Returning
  // anything else without copying them signs the user out on the next request.
  return supabaseResponse;
}
