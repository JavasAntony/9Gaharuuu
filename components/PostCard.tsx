import Link from "next/link";
import { ANON_LABEL } from "@/lib/constants";
import { LikeButton } from "./LikeButton";
import { hapusPost } from "@/app/actions/posts";
import { type FeedPost } from "@/lib/data/posts";

// `relativeTime` is formatted in the Server Component: computing it here would
// disagree with the client's own clock and trip a hydration mismatch.
export function PostCard({
  post,
  relativeTime,
  showActions = false,
}: {
  post: FeedPost;
  relativeTime: string;
  showActions?: boolean;
}) {
  const anonymous = post.anonymous;

  return (
    <article className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-baseline gap-2 text-sm">
        <span className={`font-medium ${anonymous ? "text-muted" : ""}`}>
          {anonymous ? ANON_LABEL : post.author_name}
        </span>
        <time dateTime={post.created_at} className="text-xs text-muted">
          {relativeTime}
        </time>
      </div>

      <Link href={`/post/${post.id}`} className="mt-1 block">
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {post.content}
        </p>
      </Link>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <LikeButton
          postId={post.id}
          liked={post.liked_by_me}
          count={post.like_count}
        />

        <Link
          href={`/post/${post.id}#komentar`}
          className="inline-flex min-h-11 items-center gap-1.5 text-muted transition-colors hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            className="size-5"
            aria-hidden="true"
          >
            <path
              d="M20 12a7 7 0 0 1-7 7H8l-4 2 1.2-3.6A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z"
              strokeLinejoin="round"
            />
          </svg>
          <span>{post.comment_count}</span>
          <span className="sr-only">komentar</span>
        </Link>

        {showActions && post.is_mine ? (
          <form action={hapusPost.bind(null, post.id)} className="ml-auto">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent"
            >
              Hapus
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
