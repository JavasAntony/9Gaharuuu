import type { Metadata } from "next";
import Link from "next/link";
import { listFeed } from "@/lib/data/posts";
import { formatRelativeTime } from "@/lib/format";
import { PostCard } from "@/components/PostCard";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const { items, nextCursor } = await listFeed({ cursor });

  return (
    <main>
      <header className="border-b border-line px-4 py-4">
        <h1 className="text-lg font-semibold">Feed kelas</h1>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted">
          {cursor
            ? "Tidak ada posting lagi setelah ini."
            : "Belum ada apa-apa di sini. Mulai percakapan dulu."}
        </p>
      ) : (
        <div>
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              relativeTime={formatRelativeTime(post.created_at)}
            />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="px-4 py-6">
          <Link
            href={`/feed?cursor=${encodeURIComponent(nextCursor)}`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-line text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Muat lebih banyak
          </Link>
        </div>
      ) : null}
    </main>
  );
}
