/**
 * Round avatar for the feed and the thread.
 *
 * No database round trip: `profiles.avatar_url` exists in the schema but nothing
 * in v1 or v2 writes it, so an avatar is derived from the display name instead.
 * `Anonim` and guest rows get the neutral glyph rather than a letter, because
 * there is no name to derive one from and inventing one would suggest an account
 * that does not exist.
 *
 * No `"use client"`: this is presentational and safe on both sides of the
 * boundary, so a client component can render it without pulling the server into
 * the bundle.
 */
export function Avatar({
  name,
  isGuest = false,
  size = "md",
}: {
  name: string;
  isGuest?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm"
      ? "size-8 text-[11px]"
      : size === "lg"
        ? "size-14 text-lg"
        : "size-10 text-sm";

  const initial = isGuest ? null : (name.trim()[0] ?? "?").toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${sizeClass} ${
        initial
          ? "bg-accent-soft text-accent"
          : "border border-dashed border-line bg-background text-muted"
      }`}
    >
      {initial ?? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="size-1/2">
          <circle cx="12" cy="9" r="3.2" />
          <path d="M5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}