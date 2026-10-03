const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

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
