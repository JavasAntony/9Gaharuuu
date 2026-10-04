"use client";

import { useState } from "react";

/**
 * The collapsible half of the announcement banner.
 *
 * Only the expanded/collapsed state lives here. The announcements themselves are read on the
 * server and passed in as plain strings, because `created_at` is a timestamp and formatting
 * it on the client is the hydration mismatch the rest of the app avoids by passing strings
 * down.
 *
 * There is deliberately no "dismiss". An announcement is a pinned notice for the whole
 * class, and a dismiss that survives a reload turns into a member telling the class they did
 * not see the exam date. Collapsing it is the escape hatch: it hides the bodies, keeps the
 * titles visible, and resets on the next navigation because it is component state and not
 * local storage.
 *
 * Collapsed by default once there is more than one. A single announcement is short enough to
 * read at a glance, and hiding it behind a tap would be the wrong default for the thing
 * people most need to notice.
 */
export function AnnouncementList({
  items,
  hasMore,
}: {
  items: { id: string; title: string; content: string; postedAt: string }[];
  hasMore: boolean;
}) {
  const [expanded, setExpanded] = useState(items.length <= 1);

  return (
    <div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <p className="text-sm font-bold text-accent">{item.title}</p>

            {expanded ? (
              <>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {item.content}
                </p>
                <p className="mt-1 text-xs text-muted">Diumumkan {item.postedAt}</p>
              </>
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted">{item.content}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {items.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="font-semibold text-accent hover:underline"
          >
            {expanded ? "Sembunyikan isi" : "Lihat semua isi"}
          </button>
        ) : null}

        {/* Never silently truncated: a banner that showed three of five announcements with
            no hint that two more exist would be worse than no banner at all. */}
        {hasMore ? <span>Masih ada pengumuman lain yang belum ditampilkan.</span> : null}
      </div>
    </div>
  );
}