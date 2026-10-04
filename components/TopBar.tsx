import Link from "next/link";
import { Brand } from "@/lib/nav";

/**
 * The mobile top bar.
 *
 * `lg:hidden` because the desktop rail carries the brand; below that width this
 * is the only place the wordmark appears, above the sticky `PageHeader` that
 * every page renders. `top-0` and `h-14` are the numbers `PageHeader` offsets
 * from with `top-14`, so the two bars stack instead of overlapping.
 */
export function TopBar({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-background/85 px-4 backdrop-blur-md lg:hidden">
      <Link href="/feed" aria-label="9Gaharuuu, ke feed">
        <Brand />
      </Link>

      <Link
        href={isSignedIn ? "/akun" : "/masuk"}
        aria-label={isSignedIn ? "Akun" : "Masuk"}
        className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-accent [&>svg]:size-5"
      >
        {isSignedIn ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
            <circle cx="12" cy="9" r="3.2" />
            <path d="M5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
            <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" strokeLinecap="round" />
            <path d="M10 8l4 4-4 4M14 12H4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </Link>
    </div>
  );
}