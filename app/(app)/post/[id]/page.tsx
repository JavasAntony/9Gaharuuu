import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/data/posts";
import { formatRelativeTime } from "@/lib/format";
import { PostCard } from "@/components/PostCard";
import { CommentThread } from "@/components/CommentThread";
import { idSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Postingan" };

export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;

  if (!idSchema.safeParse(id).success) notFound();

  const post = await getPost(id);
  if (!post) notFound();

  return (
    <main>
      <h1 className="sr-only">Postingan di {post.author_name}</h1>
      <PostCard post={post} relativeTime={formatRelativeTime(post.created_at)} showActions />

      <CommentThread postId={post.id} />
    </main>
  );
}
