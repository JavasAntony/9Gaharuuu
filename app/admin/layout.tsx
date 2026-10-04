import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = { title: "Admin" };

/**
 * The admin area.
 *
 * `requireAdmin` is UX, not the boundary: it redirects a member to /akun. The
 * real enforcement is `private.is_admin()` inside every moderation RPC and inside
 * the `WHERE` clause of all three admin views, so a member who reaches this route
 * by any means still sees zero rows and gets 42501 from the database on a write.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return <AppShell>{children}</AppShell>;
}