import { banHeadline, banRemaining } from "@/lib/bans";
import { formatDateTime } from "@/lib/format";
import { type SessionUser } from "@/lib/auth";

/**
 * The notice a frozen member sees, on every page.
 *
 * Rendered in `AppShell` rather than in each route, because a ban that only explains itself
 * on the feed leaves somebody who opened a post thread wondering why the composer does
 * nothing. It is above the page content and below the top bar, so it is the first thing
 * under the header on every screen including `/akun`.
 *
 * Everything it says is derived here, on the server, and handed down as strings -- the
 * remaining time in particular, because reading a clock in a Client Component is how the two
 * renders disagree.
 *
 * It is a notice, not a wall. Reading is not blocked by a ban (see `masuk` in
 * `app/actions/auth.ts`), so there is nothing here that traps somebody on a page or takes the
 * feed away; what a ban removes is the composer, the comment box and the like button.
 */
export function BanBanner({ user }: { user: SessionUser }) {
  if (!user.isBanned) return null;

  const state = {
    isBanned: user.isBanned,
    bannedUntil: user.bannedUntil,
    banReason: user.banReason,
  };

  const remaining = banRemaining(state);
  // Reached only when the ban is active, so a null `remaining` here means the end date is
  // absent rather than in the past: `isBanActive` already ruled that case out.
  const permanent = user.bannedUntil === null;

  return (
    <aside
      role="status"
      aria-label="Akun sedang dibekukan"
      className="animate-rise border-b border-line bg-accent-soft px-4 py-3"
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
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-accent">{banHeadline(state)}</p>

          <p className="mt-1 text-sm leading-relaxed">
            {user.banReason?.trim() || "Tidak ada alasan yang dicatat untuk pembekuan ini."}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {remaining
              ? `Sampai ${formatDateTime(user.bannedUntil!)}. Kamu masih bisa membaca semua yang ada di sini, tapi belum bisa kirim, balas, atau suka.`
              : permanent
                ? "Berlaku sampai dibuka oleh admin. Kamu masih bisa membaca semua yang ada di sini, tapi belum bisa kirim, balas, atau suka."
                : "Kamu masih bisa membaca semua yang ada di sini, tapi belum bisa kirim, balas, atau suka."}
          </p>
        </div>
      </div>
    </aside>
  );
}