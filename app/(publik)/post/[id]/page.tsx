import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPost } from "@/lib/data/posts";
import { formatRelativeShort, formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { CommentThread } from "@/components/CommentThread";
import { idSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Postingan" };

export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;

  if (!idSchema.safeParse(id).success) notFound();

  const [post, user] = await Promise.all([getPost(id), getCurrentUser()]);
  if (!post) notFound();

  return (
    <main>
      {/* Back goes to whichever feed this post is a row of, which is the same
          `image_url` the feed query filters on -- so "back" never lands the reader in a
          list the post is not in. */}
      <PageHeader
        title="Postingan"
        subtitle={formatRelativeTime(post.created_at)}
        backHref={post.image_url ? "/media" : "/feed"}
        backLabel={post.image_url ? "Kembali ke media" : "Kembali ke feed"}
      />

      <PostCard
        post={post}
        shortTime={formatRelativeShort(post.created_at)}
        relativeTime={formatRelativeTime(post.created_at)}
        isSignedIn={Boolean(user)}
        isAdmin={user?.role === "admin"}
        variant="thread"
      />

      <CommentThread
        postId={post.id}
        isSignedIn={Boolean(user)}
        isAdmin={user?.role === "admin"}
      />
    </main>
  );
}