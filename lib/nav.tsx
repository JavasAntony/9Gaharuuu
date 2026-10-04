/**
 * Navigation configuration.
 *
 * This module deliberately has no `"use client"` directive: `AppShell` is a
 * Server Component and needs to build the item list from the session before it
 * renders `BottomNav`, and a Server Component cannot call a function out of a
 * client module. The icons are plain JSX, so this file is still valid input for
 * the client bundle.
 *
 * Nothing here is access control. It only decides what is offered; the layouts
 * and the database decide who may actually see it.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ICONS = {
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path d="M4 5h16M4 10h16M4 15h10M4 20h7" strokeLinecap="round" />
    </svg>
  ),
  media: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4.5 17.5l4.7-4.7a1.6 1.6 0 0 1 2.3 0l3.5 3.5 1.9-1.9a1.6 1.6 0 0 1 2.3 0l2.3 2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path d="M12 3.5 19 6v5.5c0 4-3 7.4-7 8.5-4-1.1-7-4.5-7-8.5V6l7-2.5Z" strokeLinejoin="round" />
    </svg>
  ),
} as const;

/**
 * Wordmark and glyph, shared by the desktop rail and the mobile top bar so the two
 * never drift apart. It is drawn with `currentColor` so it inherits the accent
 * wherever it is placed and adds no colour of its own.
 */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path
            d="M4 19.5V6.2c0-.6.5-1 1-1 .3 0 .5.1.7.3l12.1 9.7c.4.3.4.9 0 1.2L17 18.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M7.5 16.5h6" strokeLinecap="round" />
        </svg>
      </span>
      {compact ? null : (
        <span className="text-lg font-bold tracking-tight">9Gaharuuu</span>
      )}
    </span>
  );
}

/**
 * The two feeds are always offered, because both are readable without an account. The third
 * tab is the session: Akun when signed in, Masuk when not. The Admin tab appears for an admin
 * only.
 *
 * Media is a tab rather than a button inside the text feed on purpose: the two lists are
 * genuinely different reading, and a tab is the one control that says "there is another one
 * of these" without anyone having to know what the other one is for.
 */
export function navItems(isSignedIn: boolean, isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { href: "/feed", label: "Feed", icon: ICONS.feed },
    { href: "/media", label: "Media", icon: ICONS.media },
    {
      href: isSignedIn ? "/akun" : "/masuk",
      label: isSignedIn ? "Akun" : "Masuk",
      icon: ICONS.account,
    },
  ];

  // Navigation convenience only. Hiding the tab is not the access control:
  // `/admin` re-checks the role in its own layout and every RPC re-checks it in
  // the database.
  if (isAdmin) items.push({ href: "/admin", label: "Admin", icon: ICONS.shield });

  return items;
}