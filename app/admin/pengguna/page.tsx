import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listProfiles, type AdminProfile } from "@/lib/data/users";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { CARD } from "@/lib/ui";
import { AdminTabs } from "../AdminTabs";
import { BuatAkunForm } from "./BuatAkunForm";
import { UserRow, type AccountRow } from "./UserRow";

export const metadata: Metadata = { title: "Pengguna" };

/**
 * Account management.
 *
 * `requireAdmin()` is the UX guard and the layout's is the route guard; both read the same
 * memoised session, so it costs one query. The boundary is `admin_profiles`, a definer view
 * whose `WHERE` clause is `private.is_admin()`, plus `private.is_admin()` inside every write
 * RPC. A member who reaches this route gets an empty list and 42501 from the database.
 *
 * Two things are computed here rather than in the row, because both are facts about the whole
 * list and neither should be re-derived per row:
 *
 *   * `isSelf`, so a row knows to hide the controls that would only get `P0003`.
 *   * `locksOutClass`, which is "this account is an admin and it is the last one not already
 *     banned". The database refuses that ban or demotion with `P0004`; the row disables the
 *     buttons so the reason can be explained in a sentence instead of an error code.
 *
 * `listProfiles()` is ordered by `created_at` rather than by username: the roster an admin
 * is checking against is the order the class joined in.
 */
export default async function PenggunaPage() {
  const admin = await requireAdmin();

  const profiles = await listProfiles();

  const activeAdmins = profiles.filter((profile) => profile.role === "admin" && !profile.banned_now);

  return (
    <main className="pb-10">
      <PageHeader title="Kelola pengguna" subtitle="Buat akun, bekukan, ubah peran" />

      <AdminTabs current="/admin/pengguna" />

      <div className="space-y-4 px-4 py-4">
        <section className={`${CARD} p-4`}>
          <h2 className="text-base font-bold">Buat akun baru</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Tidak ada pendaftaran mandiri di kelas ini, jadi setiap akun dibuat dari sini. Kata
            sandinya dibuat di sini juga, jadi bagikan ke yang bersangkutan lewat kanal yang
            kamu percaya.
          </p>

          <div className="mt-4">
            <BuatAkunForm key="buat-akun" />
          </div>
        </section>

        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              Semua akun <span className="text-muted">({profiles.length})</span>
            </h2>
            <p className="text-xs text-muted">
              {activeAdmins.length} admin aktif ·{" "}
              {profiles.filter((profile) => profile.banned_now).length} sedang dibekukan
            </p>
          </div>

          {profiles.length === 0 ? (
            <p className="py-8 text-sm text-muted">Belum ada akun sama sekali.</p>
          ) : (
            <ul className="-mx-4 mt-4 border-t border-line">
              {profiles.map((profile) => (
                <UserRow
                  key={profile.id}
                  isSelf={profile.id === admin.id}
                  locksOutClass={profile.role === "admin" && activeAdmins.length <= 1}
                  account={ke_baris(profile)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * Database row -> the strings the row renders.
 *
 * Every timestamp is formatted here, on the server. `formatRelativeTime` is the documented
 * no-no in a Client Component, and the absolute form is pinned to `Asia/Jakarta` in
 * `lib/format.ts` precisely so the two renders cannot disagree.
 *
 * `banExpired` is derived from the two columns the view returned rather than re-derived from
 * the clock: `is_banned` true with `banned_now` false is exactly "a ban was applied and has
 * since run out", and asking the database keeps that reading identical to the one the write
 * trigger uses.
 */
function ke_baris(profile: AdminProfile): AccountRow {
  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    createdAt: `bergabung ${formatDateTime(profile.created_at)}`,
    postCount: profile.post_count,
    commentCount: profile.comment_count,
    likeCount: profile.like_count,
    bannedNow: profile.banned_now,
    banExpired: profile.is_banned && !profile.banned_now,
    banReason: profile.ban_reason,
    bannedUntilLabel: profile.banned_until ? formatDateTime(profile.banned_until) : null,
    bannedAtLabel: profile.banned_at ? formatDateTime(profile.banned_at) : null,
    bannedBy: profile.banned_by_username,
  };
}