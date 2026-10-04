/**
 * Removes attributes that browser extensions inject into the DOM, before React
 * hydrates.
 *
 * Why this exists: React reports an attribute mismatch when the server's HTML and
 * the client's props disagree on an attribute the server never sent. An extension
 * that writes its own marker into the DOM creates exactly that, and the mismatch
 * cannot be patched because React never owned the attribute. Bisect is the one
 * that reports here -- it marks every element it has inspected with
 * `bis_skin_checked`, which is a few hundred elements in this app.
 *
 * `suppressHydrationWarning` cannot absorb that. React honours the flag for the
 * single element it sits on and for nothing below it, so the flags in
 * `app/layout.tsx` and `components/AppShell.tsx` cover the document roots and the
 * shell's two wrappers and stop there. Flagging every descendant would mean
 * flagging the whole tree, which is the thing this component replaces.
 *
 * Why it lands in time: this renders as the first child of `<body>`, so it is an
 * inline classic script parsed while the shell is still streaming, and it executes
 * synchronously at that point -- long before the deferred client bundle that calls
 * `hydrateRoot`. The observer it installs then covers everything appended after
 * that, including the streamed route chunks.
 *
 * Why it cannot race hydration: observer callbacks are microtasks and React's
 * hydration pass is one synchronous task, so nothing here can run in the middle of
 * a comparison. An attribute either arrives before hydration and is gone by then,
 * or after it and is cleaned up afterwards, where React no longer looks.
 *
 * Scope: only the prefixes extensions use for their own bookkeeping. The pattern
 * is the single place to extend, and stripping arbitrary unknown attributes would
 * be worse than the problem -- React owns `class`, `style`, and the ARIA and data
 * attributes the app sets deliberately.
 */
const SCRUBBER = `(() => {
  const INJECTED = /^(bis_|data-bis-)/;

  const strip = (node) => {
    for (const name of node.getAttributeNames()) {
      if (INJECTED.test(name)) node.removeAttribute(name);
    }
  };

  const scrub = (node) => {
    if (node.nodeType !== 1) return;
    strip(node);
    for (const child of node.children) scrub(child);
  };

  const root = document.documentElement;
  if (!root) return;

  scrub(root);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        strip(record.target);
      } else {
        for (const node of record.addedNodes) scrub(node);
      }
    }
  }).observe(root, { childList: true, subtree: true, attributes: true });
})();`;

export function ExtensionScrubber() {
  return <script dangerouslySetInnerHTML={{ __html: SCRUBBER }} />;
}