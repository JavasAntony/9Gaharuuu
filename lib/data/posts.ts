import { createClient } from "@/lib/supabase/server";
import { POSTS_PER_PAGE } from "@/lib/constants";

export type FeedPost = {
  id: string;
  content: string;
  image_url: string | null;
  anonymous: boolean;
  created_at: string;
  author_name: string;
  is_mine: boolean;
  liked_by_me: boolean;
  like_count: number;
  comment_count: number;
};

export type FeedPage = {
  items: FeedPost[];
  nextCursor: string | null;
};

const FEED_COLUMNS =
  "id, content, image_url, anonymous, created_at, author_name, is_mine, liked_by_me, like_count, comment_count";

/**
 * The only module that reads posts. Everything goes through the `post_feed`
 * view, because the client has no table-level SELECT on `posts` and no grant on
 * `posts.user_id`.
 *
 * Keyset pagination: `created_at` alone is not unique, so the cursor is
 * (created_at, id) and both are compared.
 */
export async function listFeed({
  cursor,
  limit = POSTS_PER_PAGE,
}: {
  cursor?: string | undefined;
  limit?: number;
}): Promise<FeedPage> {
  const supabase = await createClient();

  let query = supabase
    .from("post_feed")
    .select(FEED_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const { createdAt, id } = decoded;
    // Row-wise "less than": (created_at, id) < (cursor.created_at, cursor.id).
    // `.or()` supplies the surrounding parentheses itself, so this is a bare list.
    // PostgREST needs the timestamp quoted because it contains `:` and `+`.
    const keyset = `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt."${id}")`;
    query = query.or(keyset);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as FeedPost[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("post_feed")
    .select(FEED_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as FeedPost | null) ?? null;
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
}

/** Returns null for anything that is not one of our own cursors. */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as { createdAt?: unknown }).createdAt !== "string" ||
      typeof (decoded as { id?: unknown }).id !== "string" ||
      Number.isNaN(Date.parse((decoded as { createdAt: string }).createdAt))
    ) {
      return null;
    }

    return decoded as { createdAt: string; id: string };
  } catch {
    return null;
  }
}
