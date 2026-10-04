import { FeedSkeleton } from "@/components/FeedSkeleton";

/**
 * The media feed's loading boundary, same shape as the text feed's: the header holds
 * position while the page it stands for is on its way.
 */
export default function MediaLoading() {
  return (
    <main>
      <div className="sticky top-14 z-30 flex h-14 items-center border-b border-line bg-background/85 px-4 backdrop-blur-md lg:top-0">
        <div className="h-4 w-28 animate-pulse rounded bg-line motion-reduce:animate-none" />
      </div>

      <FeedSkeleton rows={3} showComposer showFooter />
    </main>
  );
}