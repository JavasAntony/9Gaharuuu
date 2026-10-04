"use client";

import { useActionState, useState } from "react";
import {
  hapusPengumumanLangsung,
  togglePengumuman,
  ubahPengumuman,
} from "@/app/actions/announcements";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError, FormMessage } from "@/components/form-controls";
import { INPUT, LABEL } from "@/lib/ui";
import {
  MAX_ANNOUNCEMENT_CONTENT_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
} from "@/lib/constants";
import { type ActionState } from "@/lib/action-state";
import { ModerationButton } from "../ModerationButton";

const INITIAL: ActionState = {};

/** What the page already rendered, so no timestamp is formatted in here. */
export type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  postedAt: string;
  updatedAt: string | null;
  author: string;
};

/**
 * One announcement, with edit, archive and delete.
 *
 * Archive is the reversible one and the button that leads, because an announcement that was
 * up for ten minutes and should never have been is a mistake somebody has to fix under
 * pressure. Delete asks first and is per-row, like the account removal on the other page.
 *
 * The edit form starts empty rather than pre-filled with the current text. A controlled
 * input seeded from a server-rendered prop is exactly the place hydration and stale data
 * disagree, and an announcement is short enough that retyping a typo is cheaper than being
 * wrong about what is on screen.
 */
export function PengumumanRow({ item }: { item: AnnouncementRow }) {
  const [toggleState, toggleAction] = useActionState(togglePengumuman, INITIAL);
  const [editState, editAction] = useActionState(ubahPengumuman, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted">
        <span className="text-sm font-bold text-foreground">{item.title}</span>

        {item.isActive ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            Tayang
          </span>
        ) : (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
            Diarsipkan
          </span>
        )}

        <span className="ml-auto">
          {item.author} · {item.postedAt}
          {item.updatedAt ? ` · diubah ${item.updatedAt}` : ""}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {item.content}
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <form action={toggleAction}>
          <input type="hidden" name="announcementId" value={item.id} />
          <input type="hidden" name="active" value={item.isActive ? "false" : "true"} />
          <ModerationButton pendingLabel="Menyimpan...">
            {item.isActive ? "Arsipkan" : "Tayangkan lagi"}
          </ModerationButton>
        </form>

        <details>
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">
            Ubah isi
          </summary>

          <form action={editAction} className="mt-3 grid gap-2">
            <input type="hidden" name="announcementId" value={item.id} />

            <div>
              <label htmlFor={`title-${item.id}`} className={LABEL}>
                Judul
              </label>
              <input
                id={`title-${item.id}`}
                name="title"
                required
                maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
                defaultValue={item.title}
                className={`${INPUT} mt-1.5`}
              />
              <FieldError errors={editState.fieldErrors?.title} />
            </div>

            <div>
              <label htmlFor={`content-${item.id}`} className={LABEL}>
                Isi
              </label>
              <textarea
                id={`content-${item.id}`}
                name="content"
                required
                rows={4}
                maxLength={MAX_ANNOUNCEMENT_CONTENT_LENGTH}
                defaultValue={item.content}
                className={`${INPUT} mt-1.5 resize-y`}
              />
              <FieldError errors={editState.fieldErrors?.content} />
            </div>

            <div>
              <ModerationButton pendingLabel="Menyimpan...">Simpan perubahan</ModerationButton>
            </div>
          </form>
        </details>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="ml-auto inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:text-accent"
        >
          Hapus
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-sm">
        <FormMessage message={toggleState.message} />
        <FormMessage message={editState.message} />
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Hapus pengumuman ini?"
          confirmLabel="Hapus permanen"
          pendingLabel="Menghapus..."
          description={
            <p>
              Pengumuman &ldquo;{item.title}&rdquo; akan hilang dari setiap halaman dan tidak
              bisa dikembalikan. Kalau hanya mau berhenti menampilkannya, arsipkan saja.
            </p>
          }
          onConfirm={() => hapusPengumumanLangsung(item.id)}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </li>
  );
}