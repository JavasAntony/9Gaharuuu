import { createClient } from "@/lib/supabase/server";

/** How far back the dashboard looks. Old resolved reports are the ones to skip. */
export const REPORTS_WINDOW = 200;

/**
 * How much guest content the dashboard shows at once.
 *
 * Guest content is only listed so an admin can sweep it; every item is also
 * reachable through a report, and anything older than the window is kept in the
 * database. The page says so out loud when a list is full, so the number in the
 * heading is never mistaken for a total.
 */
export const GUEST_LIST_LIMIT = 100;

export type AdminReport = {
  id: string;
  reason: string;
  description: string | null;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  post_id: string | null;
  comment_id: string | null;
  /**
   * Which table the content lives in, not which column the report used. A guest
   * post arrives as `post_id` and a guest reply as `comment_id`, but both are
   * guest content, and the value is handed straight to `public.hapus_konten` as
   * `p_kind` -- so it has to name the table or the delete silently no-ops.
   *
   * A target deleted since the report was filed falls back to `post` or `comment`
   * from the column that was set, which is only ever used to disable the button.
   */
  report_type: "post" | "comment" | "guest_post" | "guest_comment";
  content_text: string | null;
  content_anonymous: boolean;
  content_created_at: string | null;
  content_author_id: string | null;
  content_author_username: string | null;
  comment_author_id: string | null;
  comment_author_username: string | null;
  reporter_username: string | null;
  resolver_username: string | null;
};

export type AdminGuestPost = {
  id: string;
  content: string;
  created_at: string;
};

const REPORT_COLUMNS =
  "id, reason, description, status, created_at, resolved_at, post_id, comment_id, report_type, content_text, content_anonymous, content_created_at, content_author_id, content_author_username, comment_author_id, comment_author_username, reporter_username, resolver_username";

/**
 * The only module that reads moderation data.
 *
 * Both reads go through definer views whose `WHERE` clause is
 * `private.is_admin()`. A non-admin therefore gets zero rows here rather than an
 * error, which is why the caller must have already run `requireAdmin()`.
 *
 * `content_author_username` is the real author even when the content was posted
 * anonymously. That is deliberate and is the one place in the system where
 * anonymity is lifted: it is admin-only and exists so a moderator can act.
 *
 * `content_author_username` is null for guest content by construction, not by
 * redaction: `guest_posts` and `guest_comments` have no author column to join, so
 * there is nothing for a moderator to unmask either.
 *
 * The window is capped at `REPORTS_WINDOW` rows so the dashboard can filter by
 * status without a second round trip, and so an admin always gets a bounded
 * page to render.
 */
export async function listReports(): Promise<AdminReport[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_reports")
    .select(REPORT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(REPORTS_WINDOW);

  if (error) throw error;
  return (data ?? []) as AdminReport[];
}

export async function listGuestPosts(): Promise<AdminGuestPost[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_guest_posts")
    .select("id, content, created_at")
    .limit(GUEST_LIST_LIMIT);

  if (error) throw error;
  return (data ?? []) as AdminGuestPost[];
}

/** Guest replies, for the same reason guest posts are listed. */
export type AdminGuestComment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
};

export async function listGuestComments(): Promise<AdminGuestComment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_guest_comments")
    .select("id, post_id, parent_comment_id, content, created_at")
    .limit(GUEST_LIST_LIMIT);

  if (error) throw error;
  return (data ?? []) as AdminGuestComment[];
}

/** The moderation trail. Only ever read by the admin dashboard. */
export type ModerationLog = {
  id: string;
  /**
   * Nullable since 0006 (`on delete set null`), and 0017 writes more rows that outlive their
   * author: deleting an account writes a `user_delete` row *after* the profile is gone, so
   * this column is null for a row whose subject no longer exists by definition.
   */
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
};

/**
 * Who did what, newest first. Every row was written inside a definer RPC with
 * `admin_id` taken from `auth.uid()`, so this list cannot be edited from the
 * client side at all, not even by an admin.
 */
export async function listModerationLogs(): Promise<ModerationLog[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_moderation_logs")
    .select("id, admin_id, admin_username, action, target_type, target_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as ModerationLog[];
}