import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

/**
 * Shell for the routes a signed-out visitor may reach: the feed, the composer
 * and a post's thread. It deliberately does not call `requireUser()`; the
 * individual pages and Server Actions are what require a session.
 *
 * `title` is an object rather than a string for the same reason the root layout uses
 * one: a plain string here would replace the inherited template for every page in this
 * group, so `/feed` would be titled "Feed" while `/masuk`, outside this group, was
 * titled "Masuk · 9Gaharuuu".
 */
export const metadata: Metadata = {
  title: {
    default: "9Gaharuuu",
    template: "%s · 9Gaharuuu",
  },
  robots: { index: false, follow: false },
};

/**
 * Shell for the routes a signed-out visitor may reach: the feed, the composer
 * and a post's thread. It deliberately does not call `requireUser()`; the
 * individual pages and Server Actions are what require a session.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}