"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type NavItem } from "@/lib/nav";

/**
 * Fixed bottom navigation.
 *
 * Takes the items as a prop instead of building them here, because the list
 * depends on the session and `AppShell` is the Server Component that knows it.
 * That keeps the auth-aware decision in one place: `lib/nav.tsx`.
 *
 * `lg:hidden` because the desktop rail in `SideNav` renders the same list with
 * the labels inline; two navigations on one screen would be a duplicate tab stop.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors ${
                  active ? "font-bold text-accent" : "font-medium text-muted"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full transition-colors [&>svg]:size-[22px] ${
                    active ? "bg-accent-soft" : ""
                  }`}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}