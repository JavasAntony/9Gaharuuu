"use client";

import { useActionState, useState } from "react";
import { tambahKomentar } from "@/app/actions/comments";
import { MAX_COMMENT_LENGTH } from "@/lib/constants";
import { AnonymousToggle } from "./AnonymousToggle";
import { FieldError, FormMessage, SubmitButton } from "./form-controls";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

/**
 * One composer for both cases. `parentCommentId` turns it into a reply, and
 * `replyingTo` + `onCancel` render the "Membalas @nama" chip with a way out.
 */
export function CommentForm({
  postId,
  parentCommentId = null,
  replyingTo,
  onCancel,
}: {
  postId: string;
  parentCommentId?: string | null;
  replyingTo?: string;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(tambahKomentar, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      state={state}
      postId={postId}
      parentCommentId={parentCommentId}
      replyingTo={replyingTo}
      onCancel={onCancel}
    />
  );
}

function Composer({
  formAction,
  state,
  postId,
  parentCommentId,
  replyingTo,
  onCancel,
}: {
  formAction: (formData: FormData) => void;
  state: ActionState;
  postId: string;
  parentCommentId: string | null;
  replyingTo?: string;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState("");
  const fieldId = `comment-${parentCommentId ?? "root"}`;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentCommentId" value={parentCommentId ?? ""} />

      {replyingTo ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>
            Membalas{" "}
            <span className="font-medium text-foreground">@{replyingTo}</span>
          </span>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 text-accent underline underline-offset-4"
            >
              Batal
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {replyingTo ? "Balasan" : "Tulis komentar"}
        </label>
        <textarea
          id={fieldId}
          name="content"
          rows={parentCommentId ? 2 : 3}
          maxLength={MAX_COMMENT_LENGTH}
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={replyingTo ? "Tulis balasanmu..." : "Taruh di sini saja, deh."}
          className="w-full resize-y rounded-md border border-line px-3 py-2 text-base leading-relaxed outline-none focus-visible:border-accent"
        />
        <FieldError errors={state.fieldErrors?.content} />
      </div>

      <AnonymousToggle
        label={replyingTo ? "Balas secara Anonim" : "Komentar secara Anonim"}
      />

      <FormMessage message={state.message} />

      <div>
        <SubmitButton pendingLabel="Mengirim...">
          {replyingTo ? "Kirim balasan" : "Kirim komentar"}
        </SubmitButton>
      </div>
    </form>
  );
}
