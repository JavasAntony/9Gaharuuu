import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The sticky bar at the top of a page.
 *
 * `top-14` on small screens puts it directly under the shell's mobile top bar,
 * and `lg:top-0` returns it to the top of the window once the desktop rail takes
 * over and the mobile bar is gone. Both bars are translucent with a blur, so the
 * rows scrolling underneath stay readable as they pass.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-14 z-30 border-b border-line bg-background/85 px-4 py-3 backdrop-blur-md lg:top-0">
      <div className="flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel ?? "Kembali"}
            className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-5"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}