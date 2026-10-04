import Link from "next/link";

/**
 * The three admin surfaces, as links.
 *
 * Links rather than tabs that swap state, so each page is addressable, survives a reload and
 * works with the back button -- the same reasoning as `StatusFilter` on the moderation page.
 *
 * `/admin` keeps its own route rather than becoming `/admin/moderasi`: it is the page the nav
 * tab points at and has been since 0002, and moving it would break the one URL this codebase
 * already documents.
 */
const TABS = [
  { href: "/admin", label: "Moderasi" },
  { href: "/admin/pengguna", label: "Pengguna" },
  { href: "/admin/pengumuman", label: "Pengumuman" },
] as const;

export function AdminTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Bagian admin" className="border-b border-line px-4">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          // Exact match on the root, prefix match below it: `/admin` would otherwise stay
          // highlighted on every sub-page, which is the usual way a nav lies about where
          // you are.
          const active = tab.href === "/admin" ? current === tab.href : current.startsWith(tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:border-line hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}