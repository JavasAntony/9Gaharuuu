import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { navItems } from "@/lib/nav";
import { BottomNav } from "@/components/BottomNav";
import { RightRail } from "@/components/RightRail";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";

/**
 * The shell every signed-in or public page renders inside.
 *
 * Three columns at desktop, one at mobile: the timeline is the middle column and
 * keeps its own width, so the rail and the aside can be as wide as they like
 * without the feed text ever getting wider than a comfortable measure. Below `lg`
 * the rail and the aside are not rendered at all and the middle column takes the
 * whole viewport, with `BottomNav` in place of the rail.
 *
 * It reads the session to decide whether to offer Masuk or Akun and whether to
 * show the Admin tab. None of that is access control; the layouts and the
 * database enforce who may actually see what.
 *
 * `suppressHydrationWarning` is on both wrappers, not on `<body>` alone, because
 * React applies the flag one element deep only: setting it on `<body>` silences a
 * mismatch on `<body>` and nothing inside it. These are the outermost elements this
 * app owns, so they are the first place the flag can absorb anything. Deeper
 * extension noise is `ExtensionScrubber`'s job.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const items = navItems(Boolean(user), user?.role === "admin");

  return (
    <div
      suppressHydrationWarning
      className="mx-auto flex min-h-full w-full max-w-[1290px] justify-center bg-background"
    >
      <SideNav items={items} isSignedIn={Boolean(user)} />

      <div
        suppressHydrationWarning
        className="flex min-h-dvh min-w-0 flex-1 flex-col border-line lg:max-w-[600px] lg:border-x"
      >
        <TopBar isSignedIn={Boolean(user)} />
        {/* Room for the fixed bottom bar on mobile; the desktop rail needs none. */}
        <div className="flex-1 pb-20 lg:pb-0">{children}</div>
      </div>

      <RightRail items={items} isSignedIn={Boolean(user)} />

      <BottomNav items={items} />
    </div>
  );
}