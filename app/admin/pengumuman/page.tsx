import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import {
  ANNOUNCEMENT_DISPLAY_LIMIT,
  listAdminAnnouncements,
  type AdminAnnouncement,
} from "@/lib/data/announcements";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { CARD } from "@/lib/ui";
import { AdminTabs } from "../AdminTabs";
import { BuatPengumumanForm } from "./BuatPengumumanForm";
import { PengumumanRow, type AnnouncementRow } from "./PengumumanRow";

export const metadata: Metadata = { title: "Pengumuman" };

/**
 * The announcement manager.
 *
 * `announcements` holds no client grant at all, so this page reads through
 * `admin_announcements` and writes through the four definer RPCs in
 * `app/actions/announcements.ts`. Every write stamps `author_id` from `auth.uid()` and
 * appends to `moderation_logs`, so an admin cannot publish under somebody else's name and the
 * moderation page explains every row in this list.
 *
 * Active ones are listed first because that is the question being asked of this page most of
 * the time -- what is the class seeing right now -- and archived ones sink below them rather
 * than disappearing, because "when did we say that?" is the second question.
 */
export default async function PengumumanPage() {
  await requireAdmin();

  const announcements = await listAdminAnnouncements();

  const sorted = [...announcements].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

  const activeCount = announcements.filter((item) => item.is_active).length;
  const overBannerLimit = activeCount > ANNOUNCEMENT_DISPLAY_LIMIT;

  return (
    <main className="pb-10">
      <PageHeader title="Pengumuman kelas" subtitle="Disiarkan ke semua orang yang membuka feed" />

      <AdminTabs current="/admin/pengumuman" />

      <div className="space-y-4 px-4 py-4">
        <section className={`${CARD} p-4`}>
          <h2 className="text-base font-bold">Tulis pengumuman</h2>
          <div className="mt-4">
            <BuatPengumumanForm key="buat-pengumuman" />
          </div>
        </section>

        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              Riwayat <span className="text-muted">({announcements.length})</span>
            </h2>
            <p className="text-xs text-muted">
              {activeCount} tayang
              {/* Said out loud rather than left implicit: the banner on /feed stacks at most
                  three, so more than that means some of them are invisible to readers. */}
              {overBannerLimit ? ` · banner hanya menampilkan ${ANNOUNCEMENT_DISPLAY_LIMIT} pertama` : ""}
            </p>
          </div>

          {sorted.length === 0 ? (
            <p className="py-8 text-sm text-muted">Belum ada pengumuman.</p>
          ) : (
            <ul className="-mx-4 mt-4 border-t border-line">
              {sorted.map((item) => (
                <PengumumanRow key={item.id} item={ke_baris(item)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * Database row -> the strings the row renders. Timestamps are formatted here, on the server,
 * for the same reason `PenggunaPage` does it: relative time in a Client Component is a
 * hydration mismatch waiting for a unit boundary to land between the two renders.
 */
function ke_baris(item: AdminAnnouncement): AnnouncementRow {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    isActive: item.is_active,
    postedAt: formatDateTime(item.created_at),
    // Only worth showing when it differs from the creation, which is what a null
    // `updated_at` after an edit is not: the column has a default and the trigger only
    // touches it on update, so this stays null until something is actually edited.
    updatedAt: item.updated_at === item.created_at ? null : formatDateTime(item.updated_at),
    author: item.author_username ?? "Akun terhapus",
  };
}