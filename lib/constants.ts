export const POSTS_PER_PAGE = 20;

export const MAX_POST_LENGTH = 2000;
export const MAX_GUEST_POST_LENGTH = 1000;
export const MAX_COMMENT_LENGTH = 1000;

export const MAX_REPORT_DESCRIPTION = 1000;

/** Matches `moderation_logs.reason` and `profiles.ban_reason` (migration 0017). */
export const MAX_AUDIT_REASON_LENGTH = 500;

export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 120;
export const MAX_ANNOUNCEMENT_CONTENT_LENGTH = 1000;

/**
 * The floor for a password an admin sets for somebody else.
 *
 * Only the length is checked, and only in the form: the Auth Admin API owns the real rules
 * and reports its own failure, which `buatAkun` passes through. A stricter policy here
 * would be a second opinion that can disagree with the one that decides.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const ANON_LABEL = "Anonim";

/**
 * The domain that turns a username into an auth email.
 *
 * Deliberately still the pre-rebrand name. `app/actions/auth.ts` builds
 * `{username}@{SYNTHETIC_EMAIL_DOMAIN}` to find the account at sign-in, so every
 * seeded user is stored as `admin@kelaskita.local`, `sari@kelaskita.local` and so
 * on. Changing this string would not rename those accounts -- it would make every
 * one of them unfindable, and the sign-in screen takes a username, so nobody would
 * be able to tell that the lookup had started failing.
 *
 * The domain is never shown and never typed: it is an implementation detail of using
 * an email as a username carrier.
 */
export const SYNTHETIC_EMAIL_DOMAIN = "kelaskita.local";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,24}$/;

/**
 * Routes a signed-out visitor may reach.
 *
 * This list drives one thing only: the optimistic redirect in `lib/supabase/proxy.ts`,
 * so a signed-out tap on a private route lands on `/masuk` before the server has
 * rendered anything. It is not the security boundary -- a request that skips the
 * proxy still gets stopped, because the real guard is structural: private pages
 * live in the `(app)` route group whose layout calls `requireUser()`, and public
 * pages live in `(publik)`, which does not.
 *
 * `/feed`, `/media` and `/post/*` are public because v2 lets a visitor read and
 * post anonymously. `/admin` is deliberately absent: it is guarded by the admin role
 * inside its own layout, not by being in this list.
 */
export const PUBLIC_PATHS = ["/", "/masuk", "/feed", "/media", "/post"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}