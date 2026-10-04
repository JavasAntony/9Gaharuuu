"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { PILL_GHOST, PILL_PRIMARY } from "@/lib/ui";
import { Spinner } from "./Spinner";

/**
 * Confirmation for something irreversible.
 *
 * Built to be the answer to a question, not a form: `onConfirm` returns the reason it
 * failed, or null, and this owns everything around that -- the busy lock so a second tap
 * cannot fire the action twice, the failure text, and the fact that the sheet stays open
 * exactly as long as the decision is still open.
 *
 * Focus lands on Cancel rather than on the confirming button. A dialog that autofocuses
 * "Delete" is one Enter keypress away from the thing it is asking about, and the whole
 * reason this sheet exists is that the answer is not the default.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel = "Menghapus...",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  /** Resolves null on success -- the sheet closes -- or with a message to display. */
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Escape stops meaning "cancel" the moment the action is in flight: at that point
      // closing the sheet would hide the answer without stopping anything.
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  async function run() {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const message = await onConfirm();
      if (message) setError(message);
      else onCancel();
    } catch {
      setError("Gagal. Coba lagi sebentar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        className="w-full max-w-sm rounded-t-2xl border border-line bg-background p-5 sm:rounded-2xl"
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>

        <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>

        {error ? (
          <p role="alert" className="animate-rise mt-3 text-sm font-semibold text-accent">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            autoFocus
            className={`${PILL_GHOST} disabled:opacity-60`}
          >
            Batal
          </button>

          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className={PILL_PRIMARY}
          >
            {busy ? (
              <>
                <Spinner />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}