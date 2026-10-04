/**
 * The one spinner in the system.
 *
 * It sits inside buttons and next to them, so it is sized by its own classes and inherits
 * `currentColor`: a spinner on an accent button is white and one in a muted toolbar is
 * muted, without a variant per caller. `role="status"` is a deliberate no-op -- the
 * buttons that carry it are the ones that need `aria-busy`, and a live region nested in
 * a `role="alert"` banner would announce the same thing twice.
 */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}