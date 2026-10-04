/**
 * The feed's loading state, shaped like the feed.
 *
 * Used by `app/(publik)/feed/loading.tsx`, which is what covers the first paint and any
 * full route change into the feed. The rows are the same skeleton as the card -- circle,
 * name, two lines of text, a row of small pills -- because a placeholder whose silhouette
 * differs from the thing it stands in for is what makes a page feel like it rebuilt
 * itself rather than finished.
 *
 * The widths are fixed rather than random so the layout does not jump between one
 * loading state and the next, and every pulse opts out under `prefers-reduced-motion`.
 */
export function FeedSkeleton({
  rows = 4,
  showComposer = false,
  showFooter = false,
}: {
  rows?: number;
  showComposer?: boolean;
  showFooter?: boolean;
}) {
  return (
    <div aria-busy="true">
      {showComposer ? <ComposerSkeleton /> : null}

      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="flex gap-3 px-4 py-3">
            <Bar className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3.5 w-32" />
              <Bar className="mt-2 h-3.5 w-full" />
              <Bar className="mt-2 h-3.5 w-4/5" />

              <div className="mt-3 flex items-center gap-3">
                <Bar className="h-6 w-10 rounded-full" />
                <Bar className="h-6 w-10 rounded-full" />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {showFooter ? (
        <div className="px-4 py-6">
          <Bar className="h-9 w-full rounded-full" />
        </div>
      ) : null}

      <span className="sr-only">Memuat feed…</span>
    </div>
  );
}

/**
 * The composer's own footprint, so the timeline does not jump down when the real one
 * replaces it. Only the parts that are always there are drawn: the box and its toolbar.
 */
function ComposerSkeleton() {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-3">
      <Bar className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Bar className="h-4 w-full" />
        <Bar className="mt-2 h-4 w-2/3" />
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
          <Bar className="h-7 w-20 rounded-full" />
          <Bar className="h-8 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-line motion-reduce:animate-none ${className}`}
    />
  );
}