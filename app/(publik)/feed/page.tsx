import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listFeed } from "@/lib/data/posts";
import { formatRelativeShort, formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { LoadMoreLink } from "@/components/LoadMoreLink";
import { buatGuestPost, buatPostTeks } from "@/app/actions/posts";
import { PostComposer } from "@/components/PostComposer";
import { EmptyFeed } from "@/components/EmptyFeed";
import { PILL_GHOST } from "@/lib/ui";

export const metadata: Metadata = { title: "Feed" };

/**
 * The text feed: words, and nothing else.
 *
 * `listFeed` filters on `image_url is null`, which is the same column `PostCard` reads to
 * decide whether to draw a picture, so the query and the rendering cannot disagree about
 * which posts belong here. Anything with a picture is on `/media` instead, and the action
 * behind the composer below refuses a file even if one is attached to the form.
 */
export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const [{ items, nextCursor }, user] = await Promise.all([
    listFeed({ cursor, kind: "text" }),
    getCurrentUser(),
  ]);

  return (
    <main>
      <PageHeader
        title="Feed kelas"
        action={
          <Link href="/media" className={PILL_GHOST}>
            Media
          </Link>
        }
      />

      {/* The composer sits above the timeline rather than on its own route, so the common
          move -- read, then answer -- never needs a page change. `/media` is the
          deliberate route to the other feed for anyone who wants to send a picture. */}
      <PostComposer action={user ? buatPostTeks : buatGuestPost} guest={!user} />

      {items.length === 0 ? (
        <EmptyFeed kind="text" hasCursor={Boolean(cursor)} />
      ) : (
        <div>
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              shortTime={formatRelativeShort(post.created_at)}
              relativeTime={formatRelativeTime(post.created_at)}
              isSignedIn={Boolean(user)}
              isAdmin={user?.role === "admin"}
            />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="px-4 py-6">
          {/* A real link to the next keyset page, wrapped so the tap has an answer
              immediately: see `LoadMoreLink` for why this is not a client-side fetch. */}
          <LoadMoreLink href={`/feed?cursor=${encodeURIComponent(nextCursor)}`} />
        </div>
      ) : null}
    </main>
  );
}
