import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import {
  GUEST_LIST_LIMIT,
  REPORTS_WINDOW,
  listGuestComments,
  listGuestPosts,
  listModerationLogs,
  listReports,
  type ModerationLog,
} from "@/lib/data/moderation";
import { REPORT_STATUSES, reportStatusLabel } from "@/lib/reports";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { CARD } from "@/lib/ui";
import { GuestContentRow } from "./GuestContentRow";
import { ReportRow, StatusFilter } from "./ReportRow";

export const metadata: Metadata = { title: "Admin" };

type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

/**
 * The filter is a link, so its possible values are the same list the filter chips
 * render, read from `lib/reports.ts`. Anything unrecognised falls back to `all`,
 * which means a hand-edited `?status=` cannot reach a path that does not exist.
 */
function parseStatus(value: string | string[] | undefined): ReportStatus | "all" {
  const raw = Array.isArray(value) ? value[0] : value;
  return REPORT_STATUSES.some((status) => status.value === raw) ? (raw as ReportStatus) : "all";
}

/**
 * The moderation dashboard.
 *
 * `requireAdmin` here is the UX guard and the layout's is the route guard; both
 * read the same memoised session, so it costs one query. Neither is the security
 * boundary: all three reads go through definer views whose `WHERE` clause is
 * `private.is_admin()`, which returns zero rows to anybody else, and both writes
 * re-check the role inside their RPC.
 *
 * Reports are filtered here rather than in the query so the status counts and
 * the list come from one read of the same capped window.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();

  const params = await searchParams;
  const status = parseStatus(params.status);

  const [reports, guestPosts, guestComments, logs] = await Promise.all([
    listReports(),
    listGuestPosts(),
    listGuestComments(),
    listModerationLogs(),
  ]);

  const counts = Object.fromEntries(
    REPORT_STATUSES.map((status) => [
      status.value,
      reports.filter((report) => report.status === status.value).length,
    ]),
  ) as Record<ReportStatus, number>;

  const visible = status === "all" ? reports : reports.filter((report) => report.status === status);

  // The heading counts what is on screen, not the table, so say so whenever the
  // query actually stopped short -- otherwise 100 in the heading reads as "there
  // are 100" and an admin has no way to know there is an older backlog.
  const guestShown = guestPosts.length + guestComments.length;
  const guestTruncated =
    guestPosts.length >= GUEST_LIST_LIMIT || guestComments.length >= GUEST_LIST_LIMIT;

  return (
    <main className="pb-10">
      <PageHeader title="Moderasi kelas" subtitle="Nama asli di balik konten anonim" />

      <div className="space-y-4 px-4 py-4">
        <section id="laporan" className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              Laporan{" "}
              <span className="text-muted">
                ({status === "all" ? reports.length : visible.length})
              </span>
            </h2>
            {status === "all" && reports.length >= REPORTS_WINDOW ? (
              <p className="text-xs text-muted">Menampilkan {REPORTS_WINDOW} terbaru.</p>
            ) : null}
          </div>

          <div className="mt-3">
            <StatusFilter current={status} counts={counts} />
          </div>

          {visible.length === 0 ? (
            <p className="py-8 text-sm text-muted">
              {status === "all"
                ? "Belum ada laporan sama sekali."
                : `Tidak ada laporan berstatus ${reportStatusLabel(status)}.`}
            </p>
          ) : (
            <ul className="-mx-4 mt-4 border-t border-line">
              {visible.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </ul>
          )}
        </section>

        <section id="tamu" className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              Konten tamu terbaru <span className="text-muted">({guestShown})</span>
            </h2>
            {guestTruncated ? (
              <p className="text-xs text-muted">
                Menampilkan {guestShown} terbaru. Sisanya masih tersimpan dan bisa dicari lewat
                laporan.
              </p>
            ) : null}
          </div>

          {guestPosts.length === 0 && guestComments.length === 0 ? (
            <p className="py-8 text-sm text-muted">Belum ada konten tamu.</p>
          ) : (
            <ul className="-mx-4 mt-4 border-t border-line">
              {guestComments.map((comment) => (
                <GuestContentRow
                  key={comment.id}
                  id={comment.id}
                  content={comment.content}
                  createdAt={comment.created_at}
                  postId={comment.post_id}
                  kind="guest_comment"
                />
              ))}
              {guestPosts.map((post) => (
                <GuestContentRow
                  key={post.id}
                  id={post.id}
                  content={post.content}
                  createdAt={post.created_at}
                  kind="guest_post"
                />
              ))}
            </ul>
          )}
        </section>

        <section id="riwayat" className={`${CARD} p-4`}>
          <h2 className="text-base font-bold">Riwayat moderasi</h2>

          {logs.length === 0 ? (
            <p className="py-8 text-sm text-muted">Belum ada tindakan moderasi.</p>
          ) : (
            <ul className="-mx-4 mt-4 border-t border-line">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

const ACTION_LABELS: Record<string, string> = {
  report_review: "Menandai ditinjau",
  report_resolve: "Menyelesaikan laporan",
  report_dismiss: "Mengabaikan laporan",
  content_delete: "Menghapus konten",
};

const TARGET_LABELS: Record<string, string> = {
  post: "Postingan",
  comment: "Komentar",
  guest_post: "Posting tamu",
  guest_comment: "Balasan tamu",
  report: "Laporan",
};

function LogRow({ log }: { log: ModerationLog }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-4 py-3 text-xs text-muted last:border-b-0">
      <span className="font-semibold text-foreground">{log.admin_username ?? "Akun terhapus"}</span>
      <span>{ACTION_LABELS[log.action] ?? log.action}</span>
      <span>{TARGET_LABELS[log.target_type] ?? log.target_type}</span>
      {log.reason ? <span>· {log.reason}</span> : null}
      <span className="ml-auto">{formatDateTime(log.created_at)}</span>
    </li>
  );
}