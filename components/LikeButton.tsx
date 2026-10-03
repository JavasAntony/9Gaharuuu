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
      className="size-5"
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
 */
function LikeToggle({
  postId,
  liked,
  count,
}: {
  postId: string;
  liked: boolean;
  count: number;
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
      if (willLike) await sukaPost(postId);
      else await batalSukaPost(postId);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={optimistic.liked}
      disabled={isPending}
      className={`inline-flex min-h-11 items-center gap-1.5 transition-colors ${
        optimistic.liked ? "text-accent" : "text-muted hover:text-foreground"
      }`}
    >
      <HeartIcon filled={optimistic.liked} />
      <span className="tabular-nums">{optimistic.count}</span>
      <span className="sr-only">{willLike ? "Sukai post ini" : "Batalkan suka"}</span>
    </button>
  );
}

export function LikeButton({
  postId,
  liked,
  count,
}: {
  postId: string;
  liked: boolean;
  count: number;
}) {
  return <LikeToggle postId={postId} liked={liked} count={count} />;
}
