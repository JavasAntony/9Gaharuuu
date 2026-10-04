const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

const absoluteFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

/**
 * Absolute timestamp, for the admin surfaces where "2 jam lalu" is not enough to
 * line a report up against its content.
 *
 * `timeZone` is pinned so the server render and the client hydration produce the
 * same string; without it a visitor in another zone would mismatch.
 */
export function formatDateTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "—";
  return absoluteFormatter.format(timestamp);
}

/**
 * Indonesian relative time ("baru saja", "2 menit lalu", "kemarin").
 *
 * Must be called in a Server Component and the resulting string passed down as a
 * prop: computing it on the client from a timestamp produces a hydration
 * mismatch whenever the two renders land on different sides of a unit boundary.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";

  const delta = timestamp - now.getTime();
  const magnitude = Math.abs(delta);

  if (magnitude < 45 * 1000) return formatter.format(0, "second");

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (magnitude >= ms) {
      // Truncate rather than round: `Math.round(-1.5)` is -1, which would render
      // "90 seconds ago" as "1 menit lalu".
      const steps = Math.trunc(delta / ms);
      return formatter.format(steps, unit);
    }
  }

  return formatter.format(Math.trunc(delta / (60 * 1000)), "minute");
}

/**
 * Compact relative time for post headers: "2m", "1j", "3h".
 *
 * The feed header has room for four characters, not for "2 menit lalu". Same rule
 * as `formatRelativeTime`: render it on the server and pass the string down, or
 * the two renders will disagree. `formatRelativeTime` stays the accessible
 * version -- put it in `title` or `aria-label` next to this one.
 *
 * Units are the Indonesian abbreviations people actually write: m (menit), j
 * (jam), h (hari), mg (minggu), bln (bulan), th (tahun).
 */
const SHORT_UNITS: [string, number][] = [
  ["th", 365 * 24 * 60 * 60 * 1000],
  ["bln", 30 * 24 * 60 * 60 * 1000],
  ["mg", 7 * 24 * 60 * 60 * 1000],
  ["h", 24 * 60 * 60 * 1000],
  ["j", 60 * 60 * 1000],
  ["m", 60 * 1000],
];

export function formatRelativeShort(iso: string, now: Date = new Date()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";

  const magnitude = Math.abs(timestamp - now.getTime());

  // Under a minute is "now", not "0m".
  if (magnitude < 60 * 1000) return "baru saja";

  for (const [suffix, ms] of SHORT_UNITS) {
    if (magnitude >= ms) {
      return `${Math.trunc(magnitude / ms)}${suffix}`;
    }
  }

  return "baru saja";
}
