"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";
import { PILL_GHOST } from "@/lib/ui";
import { Spinner } from "./Spinner";

/**
 * "Load more" for the feed, as a real link that also knows it is loading.
 *
 * The feed paginates by keyset cursor, so the only way to the next page is a URL. That
 * makes this a `Link` first -- middle-click, open in a new tab and copy the link all keep
 * working, which is the point of not turning the timeline into a client-side fetch loop.
 *
 * What the `Link` cannot do is say "I am working". A plain navigation gives one frame of
 * `loading.tsx` and then a whole-page skeleton, which reads as a reload rather than as
 * three more posts arriving. Wrapping `router.push` in a transition gives this component
 * its own pending window, so the row changes to a spinner the moment it is tapped and the
 * rest of the feed never blinks out from under the reader.
 *
 * Modified clicks are left alone, which is the whole reason this stays an anchor.
 */
export function LoadMoreLink({ href, label = "Muat lebih banyak" }: { href: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented) return;
    // Let the browser handle "open somewhere else".
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    startTransition(() => router.push(href));
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      className={`${PILL_GHOST} w-full disabled:opacity-60`}
    >
      {pending ? (
        <>
          <Spinner />
          Memuat...
        </>
      ) : (
        label
      )}
    </Link>
  );
}