import Link from "next/link";
import { ANON_LABEL } from "@/lib/constants";
import { Avatar } from "./Avatar";
import { LikeButton } from "./LikeButton";
import { PostActions } from "./PostActions";
import { PostRemovalProvider } from "./PostRemoval";
import { type FeedPost } from "@/lib/data/posts";

/**
 * One row in the feed, laid out like a timeline entry: avatar on the left, name
 * and timestamp on one line, text below, counts along the bottom.
 *
 * A guest post is laid out exactly like a member post -- same header, same counts,
 * same menu. `is_guest` is read only to pick the right delete kind and to keep the
 * avatar glyph consistent; it never changes the shape of the row, because a row
 * that looked different would be telling the class that anonymous content exists,
 * and "who wrote this" is not a question the feed answers for anybody.
 *
 * Both time strings are computed in the Server Component and handed down.
 * `shortTime` is the compact label ("2m", "3h"); `relativeTime` is the full
 * phrase, kept for the tooltip and for anyone who cannot see the compact one.
 * Computing either on the client would put the two renders on opposite sides of
 * a unit boundary often enough to be a visible hydration mismatch.
 *
 * `variant="thread"` is the same row as it appears on a post's own page: the
 * avatar moves into a left rail whose line runs down into the replies, which is
 * what makes the conversation read as one thread instead of two stacked lists.
 *
 * `post.image_url` is rendered when present. The column already fetched it, so a
 * media post that did not draw its picture was a hole in the timeline rather than
 * a missing feature.
 */
export function PostCard({
  post,
  shortTime,
  relativeTime,
  isSignedIn = false,
  isAdmin = false,
  variant = "feed",
}: {
  post: FeedPost;
  shortTime: string;
  relativeTime: string;
  isSignedIn?: boolean;
  isAdmin?: boolean;
  variant?: "feed" | "thread";
}) {
  const isGuestPost = post.is_guest;
  const displayName = post.anonymous ? ANON_LABEL : post.author_name;
  const href = `/post/${post.id}`;

  // The thread variant drops its own bottom rule: `CommentThread` opens with one,
  // and two hairlines stacked read as a 2px seam.
  const surface = variant === "feed" ? "border-b border-line" : "";

  return (
    // The provider is the card's only client boundary: it owns the "this row is leaving"
    // state the delete needs, and the server output below it is passed straight through
    // rather than re-rendered on the client.
    <PostRemovalProvider>
      <article
        className={`group relative flex gap-3 px-4 py-3 transition-colors hover:bg-accent-soft/40 ${surface}`}
      >
      {variant === "thread" ? (
        <div className="flex w-10 shrink-0 flex-col items-center">
          <Avatar name={displayName} isGuest={post.anonymous || isGuestPost} />
          <span aria-hidden="true" className="mt-1 w-0.5 flex-1 rounded-full bg-line" />
        </div>
      ) : (
        <Avatar name={displayName} isGuest={post.anonymous || isGuestPost} />
      )}

        <div className="min-w-0 flex-1">
          {/* Nothing marks this row as guest content. The feed is one timeline, and a
              badge would say something the rest of the class cannot act on: who wrote
              it is not a question the feed is allowed to answer. */}
          <header className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-tight">
            <span className={`truncate font-bold ${post.anonymous ? "text-muted" : ""}`}>
              {displayName}
            </span>
            <span className="text-xs text-muted" aria-hidden="true">
              ·
            </span>
            <time
              dateTime={post.created_at}
              title={relativeTime}
              className="shrink-0 text-xs text-muted"
            >
              {shortTime}
            </time>
            <span className="sr-only">{relativeTime}</span>
          </header>

          {/* `after:absolute after:inset-0` stretches this link across the whole row, so
              the timeline behaves like one big target, while the text under it stays
              selectable. The action bar sits on a higher layer and keeps its own
              hit area. */}
          <Link
            href={href}
            className="mt-0.5 block after:absolute after:inset-0"
            aria-label={`Buka posting dari ${displayName}`}
          >
            {post.content ? (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {post.content}
              </p>
            ) : null}

            {/* `image_url` is null for every row written before images existed and for
                every row that is text only, so the timeline simply has no media block.
                A plain `<img>` rather than `next/image`: the client-side compressor in
                `lib/image.ts` already caps an upload at 500 KB and 1200px on its longest
                edge, so there is nothing left for the optimizer to shrink, and the row
                keeps the image's own aspect ratio instead of being cropped into a box. */}
            {post.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image_url}
                alt={`Gambar pada posting dari ${displayName}`}
                loading="lazy"
                decoding="async"
                className="mt-3 w-full rounded-xl border border-line"
              />
            ) : null}
          </Link>

          <div className="relative z-10 -ml-2 mt-1 flex items-center gap-1 text-muted">
            <CommentLink postId={post.id} count={post.comment_count} />
            {isSignedIn ? (
              <LikeButton
                postId={post.id}
                liked={post.liked_by_me}
                count={post.like_count}
                isGuest={isGuestPost}
              />
            ) : (
              <SignInHint count={post.like_count} />
            )}

            <PostActions
              postId={post.id}
              isGuest={isGuestPost}
              isMine={post.is_mine}
              isSignedIn={isSignedIn}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </article>
    </PostRemovalProvider>
  );
}

function CommentLink({ postId, count }: { postId: string; count: number }) {
  return (
    <Link
      href={`/post/${postId}#komentar`}
      aria-label={`${count} komentar`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-accent-soft hover:text-accent"
    >
      <CommentIcon />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

/**
 * A guest's like count stays visible but inert, and the whole thing points at
 * `/masuk` so the tap does something useful instead of nothing.
 */
function SignInHint({ count }: { count: number }) {
  return (
    <Link
      href="/masuk"
      aria-label={`Masuk untuk menyimpan suka, ${count} suka`}
      title="Masuk untuk menyimpan suka"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-accent-soft hover:text-accent"
    >
      <HeartIcon />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="size-4" aria-hidden="true">
      <path
        d="M12 20s-7.2-4.4-9-8.4C1.8 8.4 3.6 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.2 3.4 4 6.6-1.8 4-9 8.4-9 8.4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="size-4" aria-hidden="true">
      <path
        d="M20 12a7 7 0 0 1-7 7H8l-4 2 1.2-3.6A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}