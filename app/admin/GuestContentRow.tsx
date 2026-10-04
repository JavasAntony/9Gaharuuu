"use client";

import { useActionState } from "react";
import { hapusKonten } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-controls";
import { formatDateTime } from "@/lib/format";
import { type ActionState } from "@/lib/action-state";
import { ModerationButton } from "./ModerationButton";

const INITIAL: ActionState = {};

/**
 * One piece of guest content: an anonymous post, or an anonymous reply.
 *
 * Neither kind is reportable. A report targets one `posts.id` or one
 * `comments.id`, and guest rows live in `guest_posts` and `guest_comments`, so a
 * report against one raises "not found". That makes this list the only way a
 * moderator can see or remove guest content, and the `content_delete` entry in
 * `moderation_logs` the whole audit trail for it.
 *
 * One component for both kinds because the only difference is the `kind` the
 * action passes to `hapus_konten`. `postId` is the thread a reply belongs to, and
 * is null for a post, which has no thread of its own.
 */
export function GuestContentRow({
  id,
  content,
  createdAt,
  kind,
  postId = null,
}: {
  id: string;
  content: string;
  createdAt: string;
  kind: "guest_post" | "guest_comment";
  postId?: string | null;
}) {
  const [state, action] = useActionState(hapusKonten, INITIAL);
  const isReply = kind === "guest_comment";

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
          {isReply ? "Balasan tamu" : "Posting tamu"}
        </span>
        <span>{formatDateTime(createdAt)}</span>
        {postId ? (
          <a
            href={`/post/${postId}#komentar`}
            className="inline-flex min-h-9 items-center text-accent underline underline-offset-4"
          >
            Lihat di thread
          </a>
        ) : null}
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{content}</p>

      <form action={action} className="mt-3 flex items-center gap-3">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="targetId" value={id} />
        <input type="hidden" name="reason" value="Dihapus dari dashboard admin" />

        <ModerationButton tone="danger" pendingLabel="Menghapus...">
          {isReply ? "Hapus balasan tamu" : "Hapus posting tamu"}
        </ModerationButton>

        <FormMessage message={state.message} />
      </form>
    </li>
  );
}