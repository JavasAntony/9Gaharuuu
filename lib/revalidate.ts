import { revalidatePath } from "next/cache";

/**
 * The two feeds, as one cache concern.
 *
 * Splitting the timeline in two is a presentation decision; what a like, a comment or a
 * deletion changes is still "what the class can see", and a media post is readable from
 * `/media` while its own page and comment counts are readable from anywhere. So every
 * mutation invalidates both, from one list, rather than each action remembering two
 * strings and eventually forgetting one.
 *
 * `revalidatePath` marks a route stale and the next request re-renders it, so an extra
 * entry costs nothing until somebody actually asks for that page again.
 */
export const FEED_ROUTES = ["/feed", "/media"] as const;

/** Both feeds, then whatever else the mutation touched (a post page, the admin queue). */
export function revalidateFeeds(...also: string[]): void {
  for (const route of FEED_ROUTES) revalidatePath(route);
  for (const route of also) revalidatePath(route);
}