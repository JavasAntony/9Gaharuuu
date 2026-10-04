"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand, type NavItem } from "@/lib/nav";
import { PILL_PRIMARY } from "@/lib/ui";

/**
 * The desktop navigation rail.
 *
 * Wide screens get the labels inline instead of the bottom bar, so the same
 * `navItems` list is rendered twice with the active row resolved the same way.
 * The rail is `sticky top-0 h-dvh` in a flex row: `h-dvh` so it fills the window
 * without growing, and `self-start` on the item so the flex row does not stretch
 * it past the viewport and leave the stickiness nothing to stick to.
 *
 * `NavItem.icon` is JSX built in a module without `"use client"`, which is legal
 * input for this boundary -- the icon is static markup and carries no handler.
 */
export function SideNav({
  items,
  isSignedIn,
}: {
  items: NavItem[];
  isSignedIn: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col px-2 py-4 lg:flex xl:w-[300px]"
    >
      <Link href="/feed" className="flex items-center rounded-full px-3 py-2 hover:bg-accent-soft/40">
        <Brand />
      </Link>

      <ul className="mt-4 flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-4 rounded-full px-3 py-2.5 text-[15px] transition-colors ${
                  active ? "font-bold text-accent" : "font-medium hover:bg-accent-soft/40"
                }`}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full transition-colors [&>svg]:size-[22px] ${
                    active ? "text-accent" : "hover:bg-accent-soft/60"
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

      <Link href="/buat" className={`${PILL_PRIMARY} mt-5 w-full`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Posting baru
      </Link>

      <div className="mt-auto px-3 pb-1 text-xs leading-relaxed text-muted">
        <p>Kelas privat. Yang anonym tetap anonym.</p>
        <p className="mt-2">
          {isSignedIn ? "Klik nama akunmu untuk keluar." : "Masuk untuk memakai namamu."}
        </p>
      </div>
    </nav>
  );
}