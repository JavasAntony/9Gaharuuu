"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { MAX_GUEST_POST_LENGTH, MAX_POST_LENGTH } from "@/lib/constants";
import { AnonymousToggle } from "@/components/AnonymousToggle";
import { Avatar } from "@/components/Avatar";
import { ImagePreview } from "@/components/ImagePreview";
import { ImageUpload, useImageAttachment } from "@/components/ImageUpload";
import { FieldError, FormMessage } from "@/components/form-controls";
import { Spinner } from "@/components/Spinner";
import { PILL_PRIMARY } from "@/lib/ui";
import { EMPTY_POST_MESSAGE } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

type PostAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * `inline` is the composer at the top of the feed -- bare, no card around it, so
 * the timeline starts immediately under it. `card` is the same form given its own
 * page at `/buat`.
 */
export type ComposerVariant = "inline" | "card";

/** Composer for a signed-in member: named or anonymous, as before. */
export function BuatForm({
  action,
  variant = "card",
}: {
  action: PostAction;
  variant?: ComposerVariant;
}) {
  const [state, formAction, isSubmitting] = useActionState(action, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      isSubmitting={isSubmitting}
      state={state}
      max={MAX_POST_LENGTH}
      name="kamu"
      isGuest={false}
      variant={variant}
      rows={variant === "inline" ? 2 : 5}
    >
      <AnonymousToggle compact />
    </Composer>
  );
}

/**
 * Composer for a signed-out visitor.
 *
 * There is no identity toggle and no image field to disable, because the guest
 * write path accepts exactly two columns, neither of which is an identity or a
 * file. The notice tells the visitor what signing in would add, rather than
 * hiding the limit behind a disabled control.
 */
export function GuestForm({
  action,
  variant = "card",
}: {
  action: PostAction;
  variant?: ComposerVariant;
}) {
  const [state, formAction, isSubmitting] = useActionState(action, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      isSubmitting={isSubmitting}
      state={state}
      max={MAX_GUEST_POST_LENGTH}
      name="tamu"
      isGuest
      variant={variant}
      rows={variant === "inline" ? 2 : 5}
    >
      {variant === "inline" ? (
        <p className="text-xs text-muted">
          Tanpa akun, jadi anonim.{" "}
          <Link href="/masuk" className="text-accent underline underline-offset-4">
            Masuk
          </Link>{" "}
          untuk memakai nama dan menyimpan suka.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Posting tamu bersifat anonim dan hanya teks. Masuk untuk memakai nama, dan untuk
          meng—like, berkomentar, serta mengelola laporan.
        </p>
      )}
    </Composer>
  );
}

function Composer({
  formAction,
  isSubmitting,
  state,
  max,
  name,
  isGuest,
  variant,
  rows,
  children,
}: {
  formAction: (formData: FormData) => void;
  isSubmitting: boolean;
  state: ActionState;
  max: number;
  name: string;
  isGuest: boolean;
  variant: ComposerVariant;
  rows: number;
  children: React.ReactNode;
}) {
  const [content, setContent] = useState("");
  const [attempted, setAttempted] = useState(false);
  const image = useImageAttachment();
  const remaining = max - content.length;
  const inline = variant === "inline";
  const compressing = image.attachment.status === "compressing";

  // A guest's post is text only, so an empty box is just not a post yet. A member's post
  // is a box or a picture or both, which is why the button stays live with nothing typed.
  // `trim` because the Server Action trims too: a caption of only spaces is no caption.
  const canSend = isGuest ? content.length > 0 : content.trim().length > 0 || image.attachment.file !== null;
  const emptyError = !isGuest && attempted && !canSend ? EMPTY_POST_MESSAGE : null;

  // Compressing and submitting are the same lock to a reader: nothing they can change
  // would change what is being sent, so the whole composer goes quiet for both.
  const busy = compressing || isSubmitting;
  const locked = useRef(false);

  // The lock is a ref rather than the `disabled` attribute alone because a disabled
  // attribute is a render output and this has to hold between two taps. A new `state`
  // object means the action settled, which is the only moment the composer may be used
  // again -- including when it settled into an error, since that is exactly when the
  // draft has to stay usable.
  useEffect(() => {
    locked.current = false;
  }, [state]);

  return (
    <form
      action={(formData) => {
        if (locked.current) return;
        locked.current = true;

        // The picker is unnamed, so this is the only way the compressed bytes reach the
        // action. See `useImageAttachment` for why the file input is not the carrier.
        if (image.attachment.file) formData.set("image", image.attachment.file);
        formAction(formData);
      }}
      className={inline ? "flex gap-3 border-b border-line px-4 py-3" : "mt-6 flex gap-3 rounded-2xl border border-line bg-background p-4"}
    >
      <Avatar name={name} isGuest={isGuest} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="content" className="sr-only">
            Isi posting
          </label>
          <textarea
            id="content"
            name="content"
            rows={rows}
            maxLength={max}
            required={isGuest}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Bagian satu, mulai dari sini."
            className={`w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-muted ${
              inline ? "min-h-14" : "resize-y"
            }`}
          />
          <FieldError errors={state.fieldErrors?.content} />

          {emptyError ? (
            <p role="alert" aria-live="polite" className="text-sm text-accent">
              {emptyError}
            </p>
          ) : null}
        </div>

        {isGuest ? null : (
          <ImagePreview
            attachment={image.attachment}
            onClear={image.clear}
            disabled={isSubmitting}
            alt="Pratinjau gambar yang dilampirkan ke posting"
          />
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            {isGuest ? null : (
              <ImageUpload
                attachment={image.attachment}
                inputRef={image.inputRef}
                onSelect={image.select}
                disabled={isSubmitting}
              />
            )}
            {children}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <CharCount length={content.length} max={max} remaining={remaining} />

            <button
              type="submit"
              // Nothing is submitted while a pick is being compressed or a send is already
              // in flight, and a guest cannot post an empty box at all.
              disabled={busy || (isGuest && content.length === 0)}
              aria-busy={busy || undefined}
              onClick={(event) => {
                setAttempted(true);
                // Cancel the submission rather than let the action rediscover it, so the
                // person is told here rather than after a round trip.
                if (!canSend) event.preventDefault();
              }}
              className={PILL_PRIMARY}
            >
              {busy ? (
                <>
                  <Spinner />
                  {compressing ? "Mengompres..." : "Mengirim..."}
                </>
              ) : (
                "Posting"
              )}
            </button>
          </div>
        </div>

        <FormMessage message={state.message} />
      </div>
    </form>
  );
}

/**
 * The ring on the Post button: how much of the budget is already spent.
 *
 * The number itself is rendered only in the last stretch, where it is the useful
 * reading; before that the ring alone carries it and the exact count goes to
 * assistive tech as live text, so the budget is still announced while it fills.
 */
function CharCount({
  length,
  max,
  remaining,
}: {
  length: number;
  max: number;
  remaining: number;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const spent = Math.min(length, max) / max;
  const nearLimit = remaining < 50;

  return (
    <span className={`relative inline-flex size-7 items-center justify-center ${nearLimit ? "text-accent" : "text-muted"}`}>
      <span className="sr-only" aria-live="polite">
        {length} dari {max} karakter
      </span>

      <svg viewBox="0 0 24 24" className="size-7 -rotate-90" aria-hidden="true">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="currentColor" strokeWidth={2} className="text-line" />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - spent)}
          className="text-accent transition-[stroke-dashoffset] duration-150"
        />
      </svg>

      {nearLimit ? (
        <span className="absolute text-[10px] font-semibold tabular-nums">{remaining}</span>
      ) : null}
    </span>
  );
}