"use client";

import { useActionState, useEffect, useState } from "react";
import { laporkanKonten } from "@/app/actions/reports";
import { MAX_REPORT_DESCRIPTION } from "@/lib/constants";
import { REPORT_REASONS } from "@/lib/reports";
import { FieldError, FormMessage, SubmitButton } from "@/components/form-controls";
import { INPUT, LABEL, PILL_GHOST } from "@/lib/ui";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

/**
 * Report sheet for a post or a comment.
 *
 * `targetKind` and `targetId` are hidden inputs the menu fills in, so the caller
 * cannot smuggle a different target past the action: the action re-validates
 * both with zod and the database checks the target exists.
 *
 * Escape and a click on the backdrop close it, and the reason select takes focus
 * on open, so the sheet is usable from the keyboard alone.
 */
export function ReportDialog({
  targetKind,
  targetId,
  onClose,
}: {
  targetKind: "post" | "comment";
  targetId: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(laporkanKonten, INITIAL);
  const [description, setDescription] = useState("");
  const titleId = `report-title-${targetKind}-${targetId}`;
  const done = Boolean(state.successToken);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        // Only a click on the backdrop itself, never one that bubbled out of the
        // dialog, closes the sheet.
        if (event.target === event.currentTarget && !done) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-t-2xl border border-line bg-background p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            Laporkan {targetKind === "post" ? "postingan" : "komentar"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-foreground">
              Terima kasih. Laporanmu sudah masuk ke admin kelas.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`${PILL_GHOST} mt-4 w-full`}
            >
              Selesai
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="targetKind" value={targetKind} />
            <input type="hidden" name="targetId" value={targetId} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reason" className={LABEL}>
                Alasan
              </label>
              <select
                id="reason"
                name="reason"
                required
                autoFocus
                defaultValue=""
                className={`${INPUT} appearance-none`}
              >
                <option value="" disabled>
                  Pilih alasan
                </option>
                {REPORT_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
              <FieldError errors={state.fieldErrors?.reason} />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="description" className={LABEL}>
                  Keterangan <span className="font-normal text-muted">(opsional)</span>
                </label>
                <span className="text-xs text-muted tabular-nums">
                  {description.length}/{MAX_REPORT_DESCRIPTION}
                </span>
              </div>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={MAX_REPORT_DESCRIPTION}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${INPUT} resize-y leading-relaxed`}
              />
              <FieldError errors={state.fieldErrors?.description} />
            </div>

            <FormMessage message={state.message} />

            <SubmitButton pendingLabel="Mengirim...">Kirim laporan</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}