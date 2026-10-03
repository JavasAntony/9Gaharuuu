"use client";

import { useState } from "react";
import { hapusKomentar } from "@/app/actions/comments";
import { ANON_LABEL } from "@/lib/constants";
import { CommentForm } from "./CommentForm";
import type { CommentView } from "./CommentThread";

export function CommentItem({
  postId,
  comment,
  replies,
}: {
  postId: string;
  comment: CommentView;
  replies: CommentView[];
}) {
  const [replying, setReplying] = useState(false);
  const replyFieldId = `reply-${comment.id}`;

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline gap-2 text-sm">
        <span className={`font-medium ${comment.anonymous ? "text-muted" : ""}`}>
          {comment.anonymous ? ANON_LABEL : comment.author_name}
        </span>
        <time dateTime={comment.created_at} className="text-xs text-muted">
          {comment.relativeTime}
        </time>
      </div>

      <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {comment.content}
      </p>

      <div className="mt-1 flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => setReplying((value) => !value)}
          aria-expanded={replying}
          aria-controls={replyFieldId}
          className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-foreground"
        >
          Balas
        </button>

        {comment.is_mine ? (
          <form action={hapusKomentar.bind(null, comment.id)}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent"
            >
              Hapus
            </button>
          </form>
        ) : null}
      </div>

      <div id={replyFieldId} hidden={!replying} className="mt-3 rounded-md border border-line p-3">
        <CommentForm
          postId={postId}
          parentCommentId={comment.id}
          replyingTo={comment.anonymous ? ANON_LABEL : comment.author_name}
          onCancel={() => setReplying(false)}
        />
      </div>

      {replies.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l-2 border-line pl-3">
          {replies.map((reply) => (
            <li key={reply.id} className="py-2">
              <div className="flex items-baseline gap-2 text-sm">
                <span className={`font-medium ${reply.anonymous ? "text-muted" : ""}`}>
                  {reply.anonymous ? ANON_LABEL : reply.author_name}
                </span>
                <time dateTime={reply.created_at} className="text-xs text-muted">
                  {reply.relativeTime}
                </time>
              </div>

              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {reply.content}
              </p>

              {reply.is_mine ? (
                <form action={hapusKomentar.bind(null, reply.id)} className="mt-1">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-accent"
                  >
                    Hapus
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
