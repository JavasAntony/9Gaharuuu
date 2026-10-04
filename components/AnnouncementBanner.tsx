import { listActiveAnnouncements } from "@/lib/data/announcements";
import { formatRelativeTime } from "@/lib/format";
import { AnnouncementList } from "./AnnouncementList";

/**
 * Site-wide announcements, pinned above the feed.
 *
 * Read in the `(publik)` layout rather than in each page, so `/feed`, `/media` and a post's
 * thread all carry it and the three can never disagree about what is currently running. It
 * costs one query per public page, against a table whose only writer is an admin action.
 *
 * Returns null when nothing is active. An empty bordered strip above the timeline would read
 * as a broken component rather than as "there is no announcement today", and the accent
 * colour is reserved for something that is actually being said.
 *
 * The read is not wrapped in a try/catch. A failed announcement query must not take the feed
 * down with it -- the feed is the product, and the banner is a decoration on top of it.
 * `Promise.all` in the layout would reject and render nothing at all, so this is called on
 * its own and swallows its own failure.
 */
export async function AnnouncementBanner() {
  let feed;
  try {
    feed = await listActiveAnnouncements();
  } catch {
    return null;
  }

  if (feed.items.length === 0) return null;

  return (
    <aside
      aria-label="Pengumuman kelas"
      className="animate-rise border-b border-accent/20 bg-accent-soft/70 px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="mt-0.5 size-4 shrink-0 text-accent"
          aria-hidden="true"
        >
          <path d="M4 10v4h3l4 3V7l-4 3H4Z" strokeLinejoin="round" />
          <path d="M15 9.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
        </svg>

        <div className="min-w-0 flex-1">
          <AnnouncementList
            hasMore={feed.hasMore}
            items={feed.items.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
              // Relative time is computed here, on the server, and passed down as a string.
              // Doing it in the Client Component is the hydration mismatch this codebase
              // keeps out in `PostCard` and `CommentItem`.
              postedAt: formatRelativeTime(item.created_at),
            }))}
          />
        </div>
      </div>
    </aside>
  );
}