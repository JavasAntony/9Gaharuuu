/**
 * Ban vocabulary, shared by the Server Actions, the admin forms and the banner a banned
 * member sees.
 *
 * No server-only imports, so a Client Component can read `BAN_DURATIONS` to build the
 * picker without pulling `lib/format.ts` (whose relative-time helpers are documented as
 * server-only) into the browser bundle.
 *
 * The two rules that matter are stated once here rather than at each call site:
 *
 *   1. A ban is `is_banned` AND (no end date OR an end date in the future). A temporary ban
 *      that has run out is not a ban, and it is not a separate state to reconcile -- it is
 *      the same row read through this one function.
 *   2. `private.akun_terblokir()` in the database applies rule 1 on every write. This module
 *      is how the app *describes* a ban; it is not what enforces one. Nothing here should
 *      ever be the reason a write is refused.
 */

/** The three columns that describe a ban, in the shape both `me` and `admin_profiles` return. */
export type BanState = {
  isBanned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
};

/**
 * Whether the ban applies *right now*.
 *
 * Call this from a Server Component. It takes a `now` so the caller can pass the render's
 * timestamp, and reading the clock in a Client Component would produce a different answer
 * than the server did for a ban that expires mid-session.
 */
export function isBanActive(state: BanState, now: Date = new Date()): boolean {
  if (!state.isBanned) return false;
  if (!state.bannedUntil) return true;

  const until = Date.parse(state.bannedUntil);
  return Number.isNaN(until) || until > now.getTime();
}

/** One message for a refused write, whether it came from a post, a comment or a like. */
export const BAN_WRITE_MESSAGE = "Akun kamu sedang dibekuan, jadi belum bisa kirim, balas, atau suka.";

/**
 * How long a ban can be set for.
 *
 * `hours` null is a permanent ban, which in the schema is `banned_until = null` rather
 * than a date far in the future: an admin who picks "permanen" should not have to guess how
 * far into the future that is supposed to mean.
 */
export const BAN_DURATIONS = [
  { value: "24h", label: "24 jam", hours: 24 },
  { value: "3d", label: "3 hari", hours: 72 },
  { value: "7d", label: "7 hari", hours: 24 * 7 },
  { value: "30d", label: "30 hari", hours: 24 * 30 },
  { value: "forever", label: "Permanen", hours: null },
] as const;

export type BanDurationValue = (typeof BAN_DURATIONS)[number]["value"];

export const BAN_DURATION_VALUES = BAN_DURATIONS.map((duration) => duration.value);

/**
 * A preset to the timestamp it means, or null for a permanent ban.
 *
 * Computed from an explicit `from` rather than from the clock so an admin who picks "7
 * hari" gets exactly 7 days from the moment they pressed the button, and so this stays
 * testable.
 */
export function banUntilFor(duration: string, from: Date = new Date()): string | null {
  const preset = BAN_DURATIONS.find((option) => option.value === duration);
  if (!preset) return null;
  if (preset.hours === null) return null;

  return new Date(from.getTime() + preset.hours * 60 * 60 * 1000).toISOString();
}

/**
 * "sisa 6 jam" / "sisa 2 hari", or null when there is nothing to count down.
 *
 * Null covers three cases and they all mean the same thing to a reader: no end date
 * (permanent), an end date that has passed, and an account that is not banned at all. That
 * last one is why this calls `isBanActive` rather than only looking at the date -- an
 * account whose ban was lifted keeps `banned_until` out of habit rather than by design, and
 * a banner that counted down to a date on an unbanned account would be describing something
 * that is not happening.
 *
 * Rendered by the Server Component and passed down as a string. Rounded down, so "sisa 0
 * menit" is never shown: a ban in its last minute is described as "sisa 1 menit", which is
 * the direction that errs toward telling somebody they still have time.
 */
export function banRemaining(state: BanState, now: Date = new Date()): string | null {
  if (!isBanActive(state, now)) return null;
  if (!state.bannedUntil) return null;

  const until = Date.parse(state.bannedUntil);
  if (Number.isNaN(until)) return null;

  const minutes = Math.floor((until - now.getTime()) / 60_000);
  if (minutes < 1) return "sisa 1 menit";
  if (minutes < 60) return `sisa ${minutes} menit`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `sisa ${hours} jam`;

  return `sisa ${Math.floor(hours / 24)} hari`;
}

/** One line for the banner: what happened, and for how much longer. */
export function banHeadline(state: BanState, now: Date = new Date()): string {
  const remaining = banRemaining(state, now);
  return remaining ? `Akun dibekukan, ${remaining}` : "Akun dibekuan";
}

/**
 * The sign-in refusal: one sentence with the reason in it.
 *
 * Worth being specific rather than generic here. The member typed the right password, got
 * into the app, and was then refused -- "wrong password" would send them round the loop
 * trying variations, and "akun dibekukan" with no reason would give an admin nothing to
 * quote. So the reason the admin typed is what they read.
 */
export function banSignInMessage(state: BanState, now: Date = new Date()): string {
  const reason = state.banReason ? state.banReason.trim() : "";
  const remaining = banRemaining(state, now);

  const until = remaining ? ` (${remaining})` : "";

  return reason
    ? `Akun kamu dibekukan${until}. Alasannya: ${reason}`
    : `Akun kamu dibekukan${until}. Tanya admin kelasmu.`;
}