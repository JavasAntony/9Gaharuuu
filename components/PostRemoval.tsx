"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PostRemoval = {
  /**
   * True once this row is gone or on its way out. The card has already collapsed at
   * that point; the flag exists so anything inside it can stop offering to act on a
   * post that no longer exists.
   */
  removed: boolean;
  /** Hide the row the moment the action is accepted, before the revalidated list arrives. */
  markRemoved: () => void;
  /** Put the row back, for an action the server refused. */
  restore: () => void;
};

const Context = createContext<PostRemoval | null>(null);

/**
 * The optimistic half of deleting a post.
 *
 * `PostCard` is a Server Component, so it cannot hold the "this row is leaving" state
 * that the delete needs, and `PostActions` -- which can run the action -- cannot reach a
 * sibling's state either. This sits between the two: the card renders its server output
 * as `children` inside the frame below, and the menu inside that output reads the same
 * context. Nothing about the card is re-rendered on the client to achieve it.
 *
 * The collapse animates `grid-template-rows` from `1fr` to `0fr` rather than a height,
 * because the row's height is whatever the content is and there is no pixel value to
 * animate. The timing is deliberately slower than the fade: the row keeps its space for
 * a moment and then closes, so the list appears to absorb the card instead of snapping.
 *
 * This is optimism with a short half-life. `hapusPost` revalidates the feed, and the row
 * that this frame was hiding is simply not in the new list, so the state disappears with
 * it. It exists to cover the round trip, not to be a second source of truth -- which is
 * why `restore` is a plain setter and nothing has to reconcile the two afterwards.
 */
export function PostRemovalProvider({ children }: { children: ReactNode }) {
  const [removed, setRemoved] = useState(false);

  const markRemoved = useCallback(() => setRemoved(true), []);
  const restore = useCallback(() => setRemoved(false), []);

  const value = useMemo(
    () => ({ removed, markRemoved, restore }),
    [removed, markRemoved, restore],
  );

  return (
    <Context.Provider value={value}>
      <div
        inert={removed}
        aria-hidden={removed || undefined}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          removed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden transition-opacity duration-200 motion-reduce:transition-none">
          {children}
        </div>
      </div>
    </Context.Provider>
  );
}

/**
 * Null when the caller is outside a provider, so a menu rendered somewhere without one
 * behaves exactly as it did before deletion was a thing.
 */
export function usePostRemoval(): PostRemoval | null {
  return useContext(Context);
}