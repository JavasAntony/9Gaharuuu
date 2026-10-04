"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MAX_COMMENT_LENGTH } from "@/lib/constants";
import { AnonymousToggle } from "./AnonymousToggle";
import { Avatar } from "./Avatar";
import { ImagePreview } from "./ImagePreview";
import { ImageUpload, useImageAttachment } from "./ImageUpload";
import { FieldError, FormMessage } from "./form-controls";
import { Spinner } from "./Spinner";
import { PILL_PRIMARY } from "@/lib/ui";
import { EMPTY_POST_MESSAGE } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

export type CommentAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

/**
 * The reply box.
 *
 * One composer for both callers: `parentCommentId` turns it into a reply, and
 * `action` decides where the row lands. A guest gets the guest action, no identity
 * toggle, and no picture picker, because `guest_comments` has no author column, no
 * `anonymous` flag, and no `image_url` column -- there is nothing for any of the
 * three to switch.
 *
 * `key` on `successToken` remounts the composer after a successful send, which
 * is what clears the textarea without this component having to own the reset.
 */
export function CommentForm({
  postId,
  action,
  parentCommentId = null,
  replyingTo,
  allowAnonymous = true,
  onCancel,
}: {
  postId: string;
  action: CommentAction;
  parentCommentId?: string | null;
  replyingTo?: string;
  allowAnonymous?: boolean;
  onCancel?: () => void;
}) {
  const [state, formAction, isSubmitting] = useActionState(action, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      isSubmitting={isSubmitting}
      state={state}
      postId={postId}
      parentCommentId={parentCommentId}
      replyingTo={replyingTo}
      allowAnonymous={allowAnonymous}
      onCancel={onCancel}
    />
  );
}

function Composer({
  formAction,
  isSubmitting,
  state,
  postId,
  parentCommentId,
  replyingTo,
  allowAnonymous,
  onCancel,
}: {
  formAction: (formData: FormData) => void;
  isSubmitting: boolean;
  state: ActionState;
  postId: string;
  parentCommentId: string | null;
  replyingTo?: string;
  allowAnonymous: boolean;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState("");
  const [attempted, setAttempted] = useState(false);
  const image = useImageAttachment();
  const fieldId = `comment-${parentCommentId ?? "root"}`;
  const remaining = MAX_COMMENT_LENGTH - content.length;
  const isReply = parentCommentId !== null;
  const compressing = image.attachment.status === "compressing";

  // A guest reply is text only -- `guest_comments` has nowhere to put a file -- so an empty
  // box is not yet a reply. For a member the picture counts as the message.
  const canSend = allowAnonymous
    ? content.trim().length > 0 || image.attachment.file !== null
    : content.length > 0;
  const emptyError = allowAnonymous && attempted && !canSend ? EMPTY_POST_MESSAGE : null;

  // Same lock as the post composer, and for the same reason: a reply that fires twice is
  // two replies, and this form has one row and no id of its own to deduplicate with.
  const busy = compressing || isSubmitting;
  const locked = useRef(false);

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
      className="flex gap-3 rounded-2xl border border-line bg-background p-3"
    >
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentCommentId" value={parentCommentId ?? ""} />

      <Avatar name={allowAnonymous ? "kamu" : "tamu"} size={isReply ? "sm" : "md"} isGuest={!allowAnonymous} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {replyingTo ? (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>
              Membalas <span className="font-bold text-foreground">@{replyingTo}</span>
            </span>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex min-h-9 items-center text-accent underline underline-offset-4"
              >
                Batal
              </button>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId} className="sr-only">
            {replyingTo ? "Tulis balasan" : "Tulis komentar"}
          </label>
          <textarea
            id={fieldId}
            name="content"
            rows={isReply ? 2 : 3}
            maxLength={MAX_COMMENT_LENGTH}
            required={!allowAnonymous}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={replyingTo ? "Tulis balasanmu..." : "Taruh di sini saja, deh."}
            className="w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted"
          />
          <FieldError errors={state.fieldErrors?.content} />

          {emptyError ? (
            <p role="alert" aria-live="polite" className="text-sm text-accent">
              {emptyError}
            </p>
          ) : null}
        </div>

        {allowAnonymous ? (
          <ImagePreview
            attachment={image.attachment}
            onClear={image.clear}
            disabled={isSubmitting}
            alt="Pratinjau gambar yang dilampirkan ke komentar"
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            {allowAnonymous ? (
              <ImageUpload
                attachment={image.attachment}
                inputRef={image.inputRef}
                onSelect={image.select}
                disabled={isSubmitting}
              />
            ) : null}

            {allowAnonymous ? (
              <AnonymousToggle label="Komentar secara Anonim" compact />
            ) : (
              <span className="text-xs text-muted">Anonim, tanpa akun.</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span
              className={`text-xs tabular-nums ${remaining < 50 ? "text-accent" : "text-muted"}`}
              aria-live="polite"
            >
              {content.length}/{MAX_COMMENT_LENGTH}
            </span>

            <button
              type="submit"
              disabled={busy || (!allowAnonymous && content.length === 0)}
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
              ) : replyingTo ? (
                "Balas"
              ) : (
                "Kirim"
              )}
            </button>
          </div>
        </div>

        <FormMessage message={state.message} />
      </div>
    </form>
  );
}