import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

/**
 * Shell for the routes a signed-out visitor may reach: the feed, the composer
 * and a post's thread. It deliberately does not call `requireUser()`; the
 * individual pages and Server Actions are what require a session.
 *
 * `title` is an object rather than a string for the same reason the root layout uses
 * one: a plain string here would replace the inherited template for every page in this
 * group, so `/feed` would be titled "Feed" while `/masuk`, outside this group, was
 * titled "Masuk · 9Gaharuuu".
 *
 * The announcement banner belongs to the group rather than to a page because it is
 * class-wide: `/feed`, `/media` and a post's thread all carry it, so putting it here is
 * what makes it impossible for one of them to show yesterday's announcement. `AppShell`
 * renders it above this layout's children.
 */
export const metadata: Metadata = {
  title: {
    default: "9Gaharuuu",
    template: "%s · 9Gaharuuu",
  },
  robots: { index: false, follow: false },
};

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AnnouncementBanner />
      <AppShell>{children}</AppShell>
    </>
  );
}