"use client";

import { useActionState } from "react";
import Link from "next/link";
import { hapusKonten, tinjauLaporan } from "@/app/actions/admin";
import { REPORT_ACTIONS, REPORT_STATUSES, reportReasonLabel, reportStatusLabel } from "@/lib/reports";
import { FieldError, FormMessage } from "@/components/form-controls";
import { type AdminReport } from "@/lib/data/moderation";
import { type ActionState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import { ModerationButton } from "./ModerationButton";

const INITIAL: ActionState = {};

/**
 * What to call each kind, and whether it is a post.
 *
 * A report names one `posts.id` or one `comments.id`, but the content behind that
 * id may live in the guest tables instead -- and which table it lives in decides
 * three things here: the author columns to read, the id to delete, and whether
 * there is a page to link to. `report_type` answers all three, because
 * `public.hapus_konten` takes it verbatim as `p_kind`.
 */
const KIND_LABELS = {
  post: "Postingan",
  guest_post: "Posting tamu",
  comment: "Komentar",
  guest_comment: "Balasan tamu",
} as const;

function isPostKind(kind: AdminReport["report_type"]): boolean {
  return kind === "post" || kind === "guest_post";
}

/**
 * One report in the moderation queue.
 *
 * Each action gets its own `<form>` and its own `useActionState`, so a failed
 * review never disables the delete button and vice versa. A failure is rendered
 * under the form that produced it and is replaced by the next submission's
 * result, which is what makes a retry possible without a reload.
 *
 * The buttons are gated on the session, but that is presentation only: the
 * actions and `private.is_admin()` inside the RPCs are the boundary.
 */
export function ReportRow({ report }: { report: AdminReport }) {
  const [reviewState, reviewAction] = useActionState(tinjauLaporan, INITIAL);
  const [deleteState, deleteAction] = useActionState(hapusKonten, INITIAL);

  const kind = report.report_type;
  const postKind = isPostKind(kind);
  // A report targets one post *or* one comment, and the view fills the author
  // columns from whichever side it joined. Reading only `content_author_id` here
  // would hide the author of every comment report, which is the one thing this
  // page exists to show. Both are null for guest content, which has no author
  // column to unmask.
  const author = postKind ? report.content_author_username : report.comment_author_username;
  const authorId = postKind ? report.content_author_id : report.comment_author_id;
  const targetId = postKind ? report.post_id : report.comment_id;
  const isRemoved = !report.content_text;
  // A guest post is not in `posts`, so `/post/<id>` is a 404 for it. A guest reply
  // does have a page: it hangs off a member post.
  const href =
    kind === "post" && report.post_id
      ? `/post/${report.post_id}`
      : kind === "guest_comment" && report.post_id
        ? `/post/${report.post_id}#komentar`
        : null;

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
          {KIND_LABELS[kind]}
        </span>
        <span className="font-semibold text-foreground">
          {reportStatusLabel(report.status)}
        </span>
        <span>·</span>
        <span>{formatDateTime(report.created_at)}</span>
      </div>

      <p className="mt-2 text-sm font-semibold">{reportReasonLabel(report.reason)}</p>

      {report.description ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">
          {report.description}
        </p>
      ) : null}

      <blockquote className="mt-3 rounded-xl border border-line bg-accent-soft/40 px-3 py-2.5 text-sm">
        {isRemoved ? (
          <p className="text-muted italic">Konten sudah dihapus.</p>
        ) : href ? (
          <Link href={href} className="block whitespace-pre-wrap break-words hover:underline">
            {report.content_text}
          </Link>
        ) : (
          <p className="whitespace-pre-wrap break-words">{report.content_text}</p>
        )}
        <footer className="mt-1 text-xs text-muted">
          {authorId ? (
            <>
              Asli:{" "}
              <span className="font-semibold text-foreground">
                {author ?? "akun terhapus"}
              </span>
              {report.content_anonymous ? " · dikirim anonim" : null}
            </>
          ) : (
            "Tidak ada akun di balik konten ini"
          )}
        </footer>
      </blockquote>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt>Pelapor:</dt>
          <dd className="font-semibold text-foreground">{report.reporter_username ?? "—"}</dd>
        </div>
        {report.resolved_at ? (
          <div className="flex gap-1.5">
            <dt>Ditangani oleh:</dt>
            <dd className="font-semibold text-foreground">
              {report.resolver_username ?? "—"} · {formatDateTime(report.resolved_at)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {REPORT_ACTIONS.filter((action) => action.value !== report.status).map((action) => (
              <form key={action.value} action={reviewAction} className="flex items-center gap-2">
                <input type="hidden" name="reportId" value={report.id} />
                <input type="hidden" name="status" value={action.value} />
                <ModerationButton pendingLabel="Menyimpan...">{action.label}</ModerationButton>
              </form>
            ))}
          </div>

          <form action={deleteAction} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="targetId" value={targetId ?? ""} />
            <input
              type="hidden"
              name="reason"
              value={`Dihapus lewat laporan: ${reportReasonLabel(report.reason)}`}
            />
            {/* Nothing left to delete once the content is gone, so the button is
                disabled rather than left to fail on submit. */}
            <ModerationButton
              tone="danger"
              pendingLabel="Menghapus..."
              disabled={targetId === null || isRemoved}
            >
              Hapus konten ini
            </ModerationButton>
          </form>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <FormMessage message={reviewState.message} />
          <FieldError
            errors={reviewState.fieldErrors?.status ?? reviewState.fieldErrors?.reportId}
          />
          <FormMessage message={deleteState.message} />
        </div>
      </div>
    </li>
  );
}

/**
 * Status filter for the queue.
 *
 * A plain link with a `status` search param, so the filter survives a reload and
 * the list is filtered by the server rather than by hiding rows in the client.
 */
export function StatusFilter({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  const options = [{ value: "all", label: "Semua" }, ...REPORT_STATUSES];

  return (
    <nav aria-label="Saring laporan">
      <ul className="flex flex-wrap gap-2 text-xs">
        {options.map((status) => {
          const active = current === status.value;

          return (
            <li key={status.value}>
              <Link
                href={status.value === "all" ? "/admin" : `/admin?status=${status.value}`}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition-colors ${
                  active
                    ? "border-accent bg-accent-soft font-semibold text-accent"
                    : "border-line text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {status.label}
                <span className="tabular-nums">
                  {status.value === "all"
                    ? Object.values(counts).reduce((total, count) => total + count, 0)
                    : (counts[status.value] ?? 0)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}