import { createClient } from "@/lib/supabase/server";

/**
 * How many announcements the banner stacks.
 *
 * A fixed cap rather than a scroll container: the point of an announcement is that it is
 * read, and a banner that can grow without limit pushes the feed off the screen. The
 * manager shows when more are active than are on screen, so a capped banner never quietly
 * hides one.
 */
export const ANNOUNCEMENT_DISPLAY_LIMIT = 3;

/** What a reader sees. `active_announcements` carries exactly these four columns. */
export type Announcement = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export type AnnouncementFeed = {
  items: Announcement[];
  /** True when more announcements are running than the banner stacks. */
  hasMore: boolean;
};

/**
 * The running announcements, newest first.
 *
 * Readable by `anon` on purpose: `/feed` and `/media` do not require an account, and a
 * class-wide announcement that only signed-in members could read would be a different
 * announcement from the one the admin wrote.
 *
 * One row past the cap is fetched, not a count: it is the cheapest way to answer "is there
 * a fourth one?" without a second round trip, and it is why the banner can say so out loud
 * instead of showing three of five announcements with no hint that two exist.
 */
export async function listActiveAnnouncements(): Promise<AnnouncementFeed> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("active_announcements")
    .select("id, title, content, created_at")
    .limit(ANNOUNCEMENT_DISPLAY_LIMIT + 1);

  if (error) throw error;

  const rows = (data ?? []) as Announcement[];

  return {
    items: rows.slice(0, ANNOUNCEMENT_DISPLAY_LIMIT),
    hasMore: rows.length > ANNOUNCEMENT_DISPLAY_LIMIT,
  };
}

/** What the manager edits: active and archived, with who wrote each one. */
export type AdminAnnouncement = Announcement & {
  is_active: boolean;
  updated_at: string;
  author_id: string | null;
  author_username: string | null;
};

/**
 * Every announcement, archived ones included.
 *
 * The ordering is by creation rather than by `updated_at` on purpose: an admin who edits an
 * old announcement should not see it jump to the top of the list they are working through.
 */
export async function listAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_announcements")
    .select("id, title, content, is_active, created_at, updated_at, author_id, author_username")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AdminAnnouncement[];
}