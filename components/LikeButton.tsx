"use client";

import { useOptimistic, useTransition } from "react";
import { batalSukaPost, sukaPost } from "@/app/actions/posts";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      className="size-4"
      aria-hidden="true"
    >
      <path
        d="M12 20s-7.2-4.4-9-8.4C1.8 8.4 3.6 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.2 3.4 4 6.6-1.8 4-9 8.4-9 8.4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The heart flips the moment it is tapped. `useOptimistic` seeds from the values
 * the server rendered, applies the flip for the duration of the transition, and
 * falls back to the revalidated props once the Server Action resolves.
 *
 * `isGuest` picks the table the like is written to. A guest post is not in `posts`,
 * so `likes.post_id` cannot reference it; `guest_likes` exists for exactly that and
 * the flag comes from the same `post_feed.is_guest` column this row was rendered
 * from, so the two cannot drift apart.
 */
function LikeToggle({
  postId,
  liked,
  count,
  isGuest,
}: {
  postId: string;
  liked: boolean;
  count: number;
  isGuest: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic({ liked, count }, (state) => ({
    liked: !state.liked,
    count: state.count + (state.liked ? -1 : 1),
  }));

  const [isPending, startTransition] = useTransition();
  const willLike = !optimistic.liked;

  function toggle() {
    startTransition(async () => {
      setOptimistic(null);
      if (willLike) await sukaPost(postId, isGuest);
      else await batalSukaPost(postId, isGuest);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={optimistic.liked}
      aria-label={willLike ? "Sukai post ini" : "Batalkan suka"}
      disabled={isPending}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-accent-soft active:scale-95 motion-reduce:active:scale-100 ${
        optimistic.liked ? "font-semibold text-accent" : "text-muted hover:text-accent"
      }`}
    >
      {/* The heart pops once per toggle. `useOptimistic` already flips it before the
          server answers, but a fill that changes under a still heart is easy to miss when
          the count is small, and the count is the part that has to be noticed. */}
      <span className={optimistic.liked ? "animate-pop motion-reduce:animate-none" : ""}>
        <HeartIcon filled={optimistic.liked} />
      </span>
      <span className="tabular-nums">{optimistic.count}</span>
    </button>
  );
}

export function LikeButton({
  postId,
  liked,
  count,
  isGuest = false,
}: {
  postId: string;
  liked: boolean;
  count: number;
  isGuest?: boolean;
}) {
  return <LikeToggle postId={postId} liked={liked} count={count} isGuest={isGuest} />;
}
