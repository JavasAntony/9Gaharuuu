import { FeedSkeleton } from "@/components/FeedSkeleton";

/**
 * The route's own loading boundary.
 *
 * It shows the composer and the timeline in place of themselves so the header stays put
 * and the page does not appear to change identity while the feed is on its way. The row
 * count is deliberately lower than the real page size: a skeleton that fills more space
 * than the content it stands in for makes the page jump when the content arrives.
 */
export default function FeedLoading() {
  return (
    <main>
      <div className="sticky top-14 z-30 flex h-14 items-center border-b border-line bg-background/85 px-4 backdrop-blur-md lg:top-0">
        <div className="h-4 w-28 animate-pulse rounded bg-line motion-reduce:animate-none" />
      </div>

      <FeedSkeleton rows={4} showComposer showFooter />
    </main>
  );
}