import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listFeed } from "@/lib/data/posts";
import { formatRelativeShort, formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { LoadMoreLink } from "@/components/LoadMoreLink";
import { buatGuestPost, buatPost } from "@/app/actions/posts";
import { PILL_GHOST } from "@/lib/ui";
import { BuatForm, GuestForm } from "../buat/BuatForm";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const [{ items, nextCursor }, user] = await Promise.all([listFeed({ cursor }), getCurrentUser()]);

  return (
    <main>
      <PageHeader
        title="Feed kelas"
        action={
          <Link href="/buat" className={PILL_GHOST}>
            Buat
          </Link>
        }
      />

      {/* The composer sits above the timeline rather than on its own route, so the
          common move -- read, then answer -- never needs a page change. The rail's
          "Posting baru" button is the deliberate route to `/buat` for anyone who
          wants the full-page composer instead. */}
      {user ? (
        <BuatForm action={buatPost} variant="inline" />
      ) : (
        <GuestForm action={buatGuestPost} variant="inline" />
      )}

      {items.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-base font-bold">
            {cursor ? "Sudah sampai ujungnya." : "Belum ada apa-apa di sini."}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {cursor
              ? "Tidak ada posting lagi setelah ini."
              : "Mulai percakapan dulu. Bisa juga tanpa akun."}
          </p>
        </div>
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