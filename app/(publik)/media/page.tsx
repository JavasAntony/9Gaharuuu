import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listFeed } from "@/lib/data/posts";
import { formatRelativeShort, formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { EmptyFeed } from "@/components/EmptyFeed";
import { LoadMoreLink } from "@/components/LoadMoreLink";
import { buatPostMedia } from "@/app/actions/posts";
import { CARD, PILL_GHOST, PILL_PRIMARY } from "@/lib/ui";

export const metadata: Metadata = { title: "Media" };

/**
 * The media feed: a picture is the post, words are a caption on it.
 *
 * `listFeed` filters on `image_url is not null`, which is the exact complement of the text
 * feed's filter, so the two lists partition every post in the database and neither can
 * show the other's rows. There is no `feed` column to keep in step with, and no chance of
 * a post appearing twice.
 *
 * Reading is open to everyone, posting is not. `guest_posts` grants INSERT on `(id,
 * content)` and has no image column at all, so a signed-out visitor has nowhere to put a
 * picture -- the route explains that rather than offering a composer whose upload would be
 * rejected at the storage layer.
 */
export default async function MediaPage({ searchParams }: PageProps<"/media">) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const [{ items, nextCursor }, user] = await Promise.all([
    listFeed({ cursor, kind: "media" }),
    getCurrentUser(),
  ]);

  return (
    <main>
      <PageHeader
        title="Media kelas"
        action={
          <Link href="/feed" className={PILL_GHOST}>
            Teks
          </Link>
        }
      />

      {user ? (
        <div className="px-4">
          <PostComposer action={buatPostMedia} mode="media" variant="card" />
        </div>
      ) : (
        <div className="px-4">
          <section className={`${CARD} mt-6 p-4`}>
            <h2 className="text-base font-bold">Kirim gambar perlu akun</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Feed media khusus gambar, dan posting tamu belum bisa membawa gambar. Kamu tetap
              bisa melihat dan membalas semuanya tanpa masuk.
            </p>
            <Link href="/masuk" className={`${PILL_PRIMARY} mt-4 w-full`}>
              Masuk kelas
            </Link>
          </section>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyFeed kind="media" hasCursor={Boolean(cursor)} />
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
          <LoadMoreLink href={`/media?cursor=${encodeURIComponent(nextCursor)}`} />
        </div>
      ) : null}
    </main>
  );
}