"use client";

import { useState } from "react";
import { hapusKontenOtoritas } from "@/app/actions/admin";
import { hapusPost } from "@/app/actions/posts";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContentMenu, type MenuItem } from "./ContentMenu";
import { usePostRemoval } from "./PostRemoval";
import { ReportDialog } from "./ReportDialog";

/**
 * The `⋮` menu on a post, plus the two sheets it can open.
 *
 * Three ways to remove a post, and they are not interchangeable:
 *
 *   * Your own member post goes through `hapusPost`, behind a confirmation, because it is
 *     the one you can still decide about and because it deletes a thing you wrote.
 *   * Somebody else's post is admin-only and goes through `public.hapus_konten`, which
 *     logs the removal against the admin. It has no confirmation of its own: the
 *     moderation queue is where that decision is recorded, and a second prompt would only
 *     ask the same question twice.
 *   * A guest post has no author, so there is no "yours" to check and only the second path
 *     applies.
 *
 * `isMine` comes from the feed view's own `is_mine` column, the same one that decides
 * which name the row shows, so the menu cannot offer a button the action would refuse.
 */
export function PostActions({
  postId,
  isGuest,
  isMine,
  isSignedIn,
  isAdmin,
}: {
  postId: string;
  isGuest: boolean;
  isMine: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const removal = usePostRemoval();

  if (!isSignedIn) return null;

  const canDeleteOwn = isMine && !isGuest;

  const items: MenuItem[] = [
    { key: "report", label: "Laporkan", onSelect: () => setReporting(true) },
  ];

  if (canDeleteOwn) {
    items.push({ key: "delete", label: "Hapus", destructive: true, onSelect: () => setConfirming(true) });
  } else if (isAdmin) {
    items.push({
      key: "delete",
      label: "Hapus",
      destructive: true,
      onSelect: () =>
        void hapusKontenOtoritas(
          isGuest ? "guest_post" : "post",
          postId,
          isGuest ? "Dihapus dari feed" : "Dihapus oleh admin",
        ),
    });
  }

  return (
    <>
      <ContentMenu items={items} label="Opsi posting" />

      {reporting ? (
        <ReportDialog
          targetKind="post"
          targetId={postId}
          onClose={() => setReporting(false)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Hapus posting ini?"
          description="Posting, balasannya, dan gambarnya akan hilang dari feed. Tindakan ini tidak bisa dibatalkan."
          confirmLabel="Ya, hapus"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await hapusPost(postId);

            // Nothing moved, so say why instead of closing on a refusal. The card stays
            // exactly where it was.
            if (!result.ok) return result.message;

            // Collapse the row while the revalidated feed is still in flight. The state
            // dies with the row it was hiding, so nothing has to undo it afterwards.
            removal?.markRemoved();
            return null;
          }}
        />
      ) : null}
    </>
  );
}