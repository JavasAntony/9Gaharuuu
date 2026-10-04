import { createClient } from "@/lib/supabase/server";

export type ThreadComment = {
  id: string;
  post_id: string;
  content: string;
  /** A picture the comment carries, or null. Null for every guest reply. */
  image_url: string | null;
  anonymous: boolean;
  parent_comment_id: string | null;
  created_at: string;
  author_name: string;
  is_mine: boolean;
  /** True for a reply from a signed-out visitor: no author, not reportable. */
  is_guest: boolean;
};

export type CommentThread = {
  topLevel: ThreadComment[];
  repliesByParent: Map<string, ThreadComment[]>;
};

const THREAD_COLUMNS =
  "id, post_id, content, image_url, anonymous, parent_comment_id, created_at, author_name, is_mine, is_guest";

/**
 * The only module that reads comments. Reads the `comment_thread` definer view,
 * which is what lets an anonymous comment still render a name without exposing
 * `comments.user_id`, and which unions guest replies in as `is_guest` rows.
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
