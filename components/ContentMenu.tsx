"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  /**
   * Renders in the accent colour with a weight bump. Read here rather than keyed off
   * `key === "delete"`, because the caller's key is its own business and a delete that
   * forgets that string should still look like a delete.
   */
  destructive?: boolean;
  onSelect: () => void;
};

/**
 * The `⋮` disclosure on a post or comment.
 *
 * Options are passed in, but every option is still gated on the caller's session:
 * a guest sees nothing here, and a member only sees Report plus Delete when they
 * own the row (or are an admin). Hiding an option is presentation only; the
 * action and the database both re-check.
 */
export function ContentMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative ml-auto">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-1 min-w-44 overflow-hidden rounded-2xl border border-line bg-background py-1 shadow-lg shadow-foreground/10"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm transition-colors hover:bg-accent-soft ${
                item.destructive ? "font-semibold text-accent" : ""
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}