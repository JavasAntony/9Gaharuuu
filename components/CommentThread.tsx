import Link from "next/link";
import { tambahBalasanTamu, tambahKomentar } from "@/app/actions/comments";
import { formatRelativeShort, formatRelativeTime } from "@/lib/format";
import { listComments, type ThreadComment } from "@/lib/data/comments";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";

export type CommentView = ThreadComment & {
  /** Compact label for the header: "2m", "3j". */
  shortTime: string;
  /** Full phrase for the tooltip and for screen readers: "2 menit lalu". */
  relativeTime: string;
};

/**
 * Server Component: reads the `comment_thread` view and hands plain data down.
 * Both time strings are formatted here, on the server, so the client never
 * disagrees with the server about "2m" and trips a hydration mismatch.
 *
 * Everyone can reply and everyone can be replied to, so there is no branch here on
 * who or what. A guest post is commented on exactly like a member post: the
 * composer is always present, and the action decides which table the row lands in.
 * That the comment tables could once not reference a guest post at all was a foreign
 * key pointing at one table, not a rule anybody wanted.
 *
 * Comments are separated by the rail `CommentItem` draws rather than by full-width
 * rules, which is what keeps a thread readable as one conversation.
 */
export async function CommentThread({
  postId,
  isSignedIn,
  isAdmin,
}: {
  postId: string;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const { topLevel, repliesByParent } = await listComments(postId);

  let replyCount = 0;
  for (const replies of repliesByParent.values()) replyCount += replies.length;
  const total = topLevel.length + replyCount;

  const action = isSignedIn ? tambahKomentar : tambahBalasanTamu;

  return (
    <section id="komentar" className="border-t border-line">
      <h2 className="px-4 pb-1 pt-4 text-[15px] font-bold">
        Balasan <span className="text-muted">({total})</span>
      </h2>

      {topLevel.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted">
          Belum ada komentar. Mulai saja, bahkan kalau belum masuk.
        </p>
      ) : (
        <div>
          {topLevel.map((comment, index) => (
            <CommentItem
              key={comment.id}
              postId={postId}
              comment={toView(comment)}
              replies={(repliesByParent.get(comment.id) ?? []).map(toView)}
              isLast={index === topLevel.length - 1}
              isSignedIn={isSignedIn}
              isAdmin={isAdmin}
              action={action}
              allowAnonymous={isSignedIn}
            />
          ))}
        </div>
      )}

      <div className="border-t border-line px-4 py-3">
        <CommentForm postId={postId} action={action} allowAnonymous={isSignedIn} />
      </div>

      {!isSignedIn ? <GuestHint /> : null}
    </section>
  );
}

/**
 * Sits under the composer instead of replacing it: the guest box works right now,
 * so the sign-in link is an upgrade offer rather than a wall.
 */
function GuestHint() {
  return (
    <p className="px-4 pb-6 text-xs text-muted">
      <Link href="/masuk" className="inline-flex min-h-9 items-center text-accent underline underline-offset-4">
        Masuk
      </Link>{" "}
      untuk memakai nama, dan untuk meng—like serta mengelola laporan.
    </p>
  );
}

function toView(comment: ThreadComment): CommentView {
  return {
    ...comment,
    shortTime: formatRelativeShort(comment.created_at),
    relativeTime: formatRelativeTime(comment.created_at),
  };
}