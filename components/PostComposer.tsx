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
import { EMPTY_MEDIA_MESSAGE } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

/**
 * Which feed this composer writes to, and therefore what it will accept.
 *
 * The two are opposites, and the point of the split is that a control cannot be present
 * where its rule would reject it: `text` renders no image picker at all, and `media`
 * cannot be sent without one. Each Server Action refuses the other mode's format as well,
 * so this is the difference between a rule that is explained and one that is merely
 * enforced.
 */
export type PostMode = "text" | "media";

/**
 * `inline` is the composer at the top of a feed -- bare, no card around it, so the
 * timeline starts immediately under it. `card` is the same form given its own room on a
 * compose page, where it is the only thing on screen.
 */
export type ComposerVariant = "inline" | "card";

/**
 * The post composer, for both feeds and both audiences.
 *
 * One component with the audience and the feed as props, rather than four near-copies: the
 * submit lock, the compression state, the busy label and the draft-preserving error path
 * are the same code in every case, and a bug fixed in one copy would not be fixed in the
 * others.
 *
 * `guest` is not a shortcut for `mode="text"` that callers have to remember.
 * `guest_posts` grants INSERT on `(id, content)` and has no image column, so a guest
 * cannot write to the media feed at all -- the mode is coerced below rather than trusting
 * two props to agree, and `/media` does not render this component for a signed-out visitor
 * anyway.
 */
export function PostComposer({
  action,
  mode = "text",
  guest = false,
  variant = "inline",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  mode?: PostMode;
  guest?: boolean;
  variant?: ComposerVariant;
}) {
  const [state, formAction, isSubmitting] = useActionState(action, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      isSubmitting={isSubmitting}
      state={state}
      mode={guest ? "text" : mode}
      guest={guest}
      variant={variant}
    />
  );
}

function Composer({
  formAction,
  isSubmitting,
  state,
  mode,
  guest,
  variant,
}: {
  formAction: (formData: FormData) => void;
  isSubmitting: boolean;
  state: ActionState;
  mode: PostMode;
  guest: boolean;
  variant: ComposerVariant;
}) {
  const [content, setContent] = useState("");
  const [attempted, setAttempted] = useState(false);
  const image = useImageAttachment();
  const inline = variant === "inline";
  const media = mode === "media";

  const max = guest ? MAX_GUEST_POST_LENGTH : MAX_POST_LENGTH;
  const remaining = max - content.length;

  // The media feed's readiness is the picture; the text feed's is the words. `trim`
  // because the action trims too: a caption of only spaces is no caption.
  const canSend = media ? image.attachment.file !== null : content.trim().length > 0;

  // Only the media feed needs an inline refusal. A text box with nothing in it is not
  // yet a post and a disabled button says that better than a message would; a media box
  // with no picture is a question the writer has not been asked yet, so the button stays
  // live and answers on tap.
  const emptyError = media && attempted && !canSend ? EMPTY_MEDIA_MESSAGE : null;

  // Compressing and submitting are the same lock to a reader: nothing they can change
  // would change what is being sent, so the whole composer goes quiet for both.
  const compressing = image.attachment.status === "compressing";
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
      className={
        inline
          ? "flex gap-3 border-b border-line px-4 py-3"
          : "mt-6 flex gap-3 rounded-2xl border border-line bg-background p-4"
      }
    >
      <Avatar name={guest ? "tamu" : "kamu"} isGuest={guest} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* The feed's rule, said where it is being applied rather than in a help page
            nobody opens. Only the media feed needs it: a text-only box in a text feed is
            self-explanatory, a missing picture in a media feed is a puzzle. */}
        {media ? (
          <p className="text-xs leading-relaxed text-muted">
            Feed media. Satu gambar wajib, caption boleh dikosongkan.
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor="content" className="sr-only">
            {media ? "Caption posting" : "Isi posting"}
          </label>
          <textarea
            id="content"
            name="content"
            rows={inline ? 2 : 5}
            maxLength={max}
            // The media feed's words are optional, and a `required` box would block a
            // caption-less picture post before the action ever ran. The text feed's rule
            // is `min(1)`, which is what `required` means.
            required={!media}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={media ? "Caption, kalau mau." : "Bagian satu, mulai dari sini."}
            className={`w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-muted ${
              inline ? "min-h-14" : "resize-y"
            }`}
          />
          <FieldError errors={state.fieldErrors?.content} />

          {emptyError ? (
            <p role="alert" aria-live="polite" className="animate-rise text-sm text-accent">
              {emptyError}
            </p>
          ) : null}
        </div>

        {media ? <ImagePreview attachment={image.attachment} onClear={image.clear} disabled={isSubmitting} alt="Pratinjau gambar yang dilampirkan ke posting" /> : null}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            {media ? (
              <ImageUpload
                attachment={image.attachment}
                inputRef={image.inputRef}
                onSelect={image.select}
                disabled={isSubmitting}
              />
            ) : null}

            {guest ? (
              <p className="text-xs text-muted">
                {inline ? (
                  <>
                    Tanpa akun, jadi anonim.{" "}
                    <Link href="/masuk" className="text-accent underline underline-offset-4">
                      Masuk
                    </Link>{" "}
                    untuk memakai nama dan menyimpan suka.
                  </>
                ) : (
                  "Posting tamu bersifat anonim dan hanya teks. Masuk untuk memakai nama, dan untuk meng—like, berkomentar, serta mengelola laporan."
                )}
              </p>
            ) : (
              <AnonymousToggle compact />
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <CharCount length={content.length} max={max} remaining={remaining} />

            <button
              type="submit"
              disabled={busy || (!canSend && !media)}
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