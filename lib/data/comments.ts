import { createClient } from "@/lib/supabase/server";

export type ThreadComment = {
  id: string;
  post_id: string;
  content: string;
  anonymous: boolean;
  parent_comment_id: string | null;
  created_at: string;
  author_name: string;
  is_mine: boolean;
};

export type CommentThread = {
  topLevel: ThreadComment[];
  repliesByParent: Map<string, ThreadComment[]>;
};

const THREAD_COLUMNS =
  "id, post_id, content, anonymous, parent_comment_id, created_at, author_name, is_mine";

/**
 * The only module that reads comments. Reads the `comment_thread` definer view,
 * which is what lets an anonymous comment still render a name without exposing
 * `comments.user_id`.
 */
export async function listComments(postId: string): Promise<CommentThread> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comment_thread")
    .select(THREAD_COLUMNS)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as ThreadComment[];
  const repliesByParent = new Map<string, ThreadComment[]>();
  const topLevel: ThreadComment[] = [];

  for (const comment of rows) {
    if (comment.parent_comment_id === null) {
      topLevel.push(comment);
      continue;
    }
    const siblings = repliesByParent.get(comment.parent_comment_id);
    if (siblings) siblings.push(comment);
    else repliesByParent.set(comment.parent_comment_id, [comment]);
  }

  return { topLevel, repliesByParent };
}
