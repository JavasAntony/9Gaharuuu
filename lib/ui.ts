/**
 * Shared class strings for the surfaces that repeat across routes.
 *
 * The palette lives in `app/globals.css` and is not extended here: every value
 * below is one of the six tokens already declared there, or an alpha step of one
 * of them. Keeping the repeated shapes as named constants is what stops the
 * buttons from drifting apart one page at a time.
 */

export const PILL_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors";

/** Filled accent pill: the one call to action on a screen. */
export const PILL_PRIMARY = `${PILL_BASE} min-h-9 bg-accent px-4 text-sm text-white hover:opacity-90 disabled:opacity-60`;

/** Outlined pill: secondary action, never the loudest thing on the page. */
export const PILL_GHOST = `${PILL_BASE} min-h-9 border border-line px-4 text-sm hover:border-accent hover:text-accent`;

export const INPUT =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base outline-none transition-colors placeholder:text-muted focus:border-accent";

export const LABEL = "text-sm font-semibold";

export const CARD = "rounded-2xl border border-line bg-background";