import { formatRelativeTime } from "@/lib/format";
import { listComments, type ThreadComment } from "@/lib/data/comments";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";

export type CommentView = ThreadComment & { relativeTime: string };

/**
 * Server Component: reads the `comment_thread` view and hands plain data down.
 * Relative time is formatted here, on the server, so the client never disagrees
 * with the server about "2 menit lalu" and trips a hydration mismatch.
 */
export async function CommentThread({ postId }: { postId: string }) {
  const { topLevel, repliesByParent } = await listComments(postId);

  let replyCount = 0;
  for (const replies of repliesByParent.values()) replyCount += replies.length;

  return (
    <section id="komentar" className="border-t border-line">
      <h2 className="px-4 py-4 text-sm font-semibold">
        Komentar ({topLevel.length + replyCount})
      </h2>

      {topLevel.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">Belum ada komentar. Mulai saja.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {topLevel.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                postId={postId}
                comment={toView(comment)}
                replies={(repliesByParent.get(comment.id) ?? []).map(toView)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line px-4 py-4">
        <CommentForm postId={postId} />
      </div>
    </section>
  );
}

function toView(comment: ThreadComment): CommentView {
  return { ...comment, relativeTime: formatRelativeTime(comment.created_at) };
}
