"use client";

import { useState } from "react";
import { hapusKontenOtoritas } from "@/app/actions/admin";
import { ANON_LABEL } from "@/lib/constants";
import { Avatar } from "./Avatar";
import { CommentForm, type CommentAction } from "./CommentForm";
import { ContentMenu, type MenuItem } from "./ContentMenu";
import { ReportDialog } from "./ReportDialog";
import type { CommentView } from "./CommentThread";

/**
 * One comment, and the replies hanging off it.
 *
 * Anyone can reply, a guest included, so the reply control is not behind a session
 * check. Everything else is: reporting needs an account because a report has to
 * name a reporter, and deleting is an admin action because the database allows
 * nobody else to delete a comment.
 *
 * `action` and `allowAnonymous` are decided by the Server Component, which is the
 * only place that knows whether this thread belongs to a member or a guest.
 *
 * The avatar sits in a left rail whose line continues down past this comment into
 * the next one -- `isLast` stops it after the final comment -- and the rail shares
 * its column with the post's own rail, so a thread reads as one vertical spine.
 * Replies nest inside the content column, only one level deep, because that is all
 * `comment_thread` is grouped into.
 */
export function CommentItem({
  postId,
  comment,
  replies,
  isLast,
  isSignedIn,
  isAdmin,
  action,
  allowAnonymous,
}: {
  postId: string;
  comment: CommentView;
  replies: CommentView[];
  isLast: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  action: CommentAction;
  allowAnonymous: boolean;
}) {
  const [replying, setReplying] = useState(false);
  // The id being reported, not a boolean: this comment and every reply below it
  // share one sheet, so the target has to travel with the open state.
  const [reportingId, setReportingId] = useState<string | null>(null);
  const replyFieldId = `reply-${comment.id}`;

  return (
    <>
      <div className="flex gap-3 px-4 pb-1 pt-3 transition-colors hover:bg-accent-soft/30">
        <div className="flex w-10 shrink-0 flex-col items-center">
          <Avatar name={comment.author_name} isGuest={comment.is_guest || comment.anonymous} />
          {isLast ? null : (
            <span aria-hidden="true" className="mt-1 w-0.5 flex-1 rounded-full bg-line" />
          )}
        </div>

        <div className="min-w-0 flex-1 pb-3">
          <CommentHeader comment={comment} />

          <CommentBody comment={comment} />

          <div className="-ml-2 mt-0.5 flex items-center gap-1 text-muted">
            <button
              type="button"
              onClick={() => setReplying((value) => !value)}
              aria-expanded={replying}
              aria-controls={replyFieldId}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-accent-soft hover:text-accent"
            >
              <ReplyIcon />
              Balas
            </button>

            <ContentMenu
              label="Opsi komentar"
              items={menuItems({ comment, isSignedIn, isAdmin, onReport: () => setReportingId(comment.id) })}
            />
          </div>

          <div id={replyFieldId} hidden={!replying} className="mt-2">
            <CommentForm
              postId={postId}
              parentCommentId={comment.id}
              replyingTo={comment.anonymous ? ANON_LABEL : comment.author_name}
              action={action}
              allowAnonymous={allowAnonymous}
              onCancel={() => setReplying(false)}
            />
          </div>

          {replies.length > 0 ? (
            <ul className="mt-3 space-y-4">
              {replies.map((reply) => (
                <li key={reply.id} className="flex gap-3">
                  <Avatar
                    name={reply.author_name}
                    size="sm"
                    isGuest={reply.is_guest || reply.anonymous}
                  />

                  <div className="min-w-0 flex-1">
                    <CommentHeader comment={reply} />

                    <CommentBody comment={reply} />

                    <div className="-ml-2 mt-0.5 flex items-center gap-1 text-muted">
                      <ContentMenu
                        label="Opsi balasan"
                        items={menuItems({
                          comment: reply,
                          isSignedIn,
                          isAdmin,
                          onReport: () => setReportingId(reply.id),
                        })}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {reportingId ? (
        <ReportDialog
          targetKind="comment"
          targetId={reportingId}
          onClose={() => setReportingId(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Name and time on one line.
 *
 * A guest reply renders exactly like a member's: `is_guest` never reaches the
 * markup, because a tag would label a conversation as having a stranger in it and
 * the thread is a conversation either way. `shortTime` is rendered by the Server
 * Component for the same reason as on the post card; `relativeTime` stays
 * available as the tooltip and to screen readers, who get the phrase rather than
 * "2j".
 */
/**
 * The message itself: words, a picture, or both.
 *
 * `content` is empty whenever the comment is nothing but a picture, which is what a member
 * can post -- `hasTextOrImage` allows it on the server and `tambahKomentar` writes it that
 * way -- so the paragraph is dropped rather than left behind as a gap of empty line
 * height. The image is rendered the way `PostCard` renders one, for the same reason: the
 * bytes were compressed before they were stored, so the optimizer has nothing left to do,
 * and the picture keeps its own proportions instead of being cropped into a fixed box.
 */
function CommentBody({ comment }: { comment: CommentView }) {
  const displayName = comment.anonymous ? ANON_LABEL : comment.author_name;

  return (
    <>
      {comment.content ? (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {comment.content}
        </p>
      ) : null}

      {comment.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comment.image_url}
          alt={`Gambar pada komentar dari ${displayName}`}
          loading="lazy"
          decoding="async"
          className="mt-3 w-full rounded-xl border border-line"
        />
      ) : null}
    </>
  );
}

function CommentHeader({ comment }: { comment: CommentView }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-tight">
      <span className={`truncate font-bold ${comment.anonymous ? "text-muted" : ""}`}>
        {comment.anonymous ? ANON_LABEL : comment.author_name}
      </span>
      <span className="text-xs text-muted" aria-hidden="true">
        ·
      </span>
      <time dateTime={comment.created_at} title={comment.relativeTime} className="text-xs text-muted">
        {comment.shortTime}
      </time>
      <span className="sr-only">{comment.relativeTime}</span>
    </header>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="size-4" aria-hidden="true">
      <path
        d="M10 8.5V6.2c0-.6.5-1 1-1 .3 0 .5.1.7.3l7.6 6.1c.4.3.4.9 0 1.2l-7.6 6.1c-.2.2-.4.3-.7.3-.5 0-1-.4-1-1v-2.3H10c-3 0-5 1.7-5 4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Report, and -- for an admin -- delete.
 *
 * Deleting runs `hapusKontenOtoritas`, never a plain delete. `authenticated` has
 * no DELETE grant on `comments` and the only delete policy calls
 * `private.is_admin()`, so this is the single path that removes a comment and the
 * only one that leaves a `moderation_logs` row behind. That holds for the author
 * of the comment too: an owner has no delete button and no way to reach one.
 *
 * `is_guest` picks which table the id belongs to, not what may be offered: a guest
 * reply is reportable and deletable exactly like a member comment, because
 * `public.buat_laporan` resolves a target in either table.
 */
function menuItems({
  comment,
  isSignedIn,
  isAdmin,
  onReport,
}: {
  comment: CommentView;
  isSignedIn: boolean;
  isAdmin: boolean;
  onReport: () => void;
}): MenuItem[] {
  if (!isSignedIn) return [];

  const items: MenuItem[] = [{ key: "report", label: "Laporkan", onSelect: onReport }];

  if (isAdmin) {
    items.push({
      key: "delete",
      label: "Hapus",
      destructive: true,
      onSelect: () =>
        void hapusKontenOtoritas(
          comment.is_guest ? "guest_comment" : "comment",
          comment.id,
          "Dihapus oleh admin",
        ),
    });
  }

  return items;
}