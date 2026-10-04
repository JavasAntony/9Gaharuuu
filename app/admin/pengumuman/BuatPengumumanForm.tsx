"use client";

import { useActionState } from "react";
import { buatPengumuman } from "@/app/actions/announcements";
import { FieldError, FormMessage } from "@/components/form-controls";
import { INPUT, LABEL } from "@/lib/ui";
import {
  MAX_ANNOUNCEMENT_CONTENT_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
} from "@/lib/constants";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

/**
 * Write a new announcement.
 *
 * Mounted with a `key` from the page and remounted on success, the same trick as
 * `PostComposer` and `BuatAkunForm`: the form empties itself because React threw the old one
 * away, rather than because an effect reset two controlled inputs.
 *
 * The length hints are the same numbers as the table's CHECK constraints and the schema's
 * `max()`, so a browser-side `maxLength` and a database refusal cannot disagree about where
 * the limit is.
 */
export function BuatPengumumanForm() {
  const [state, action] = useActionState(buatPengumuman, INITIAL);

  return (
    <form action={action} className="grid gap-3">
      <div>
        <label htmlFor="title" className={LABEL}>
          Judul
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
          placeholder="mis. Jadwal ulangan fishery"
          className={`${INPUT} mt-1.5`}
        />
        <FieldError errors={state.fieldErrors?.title} />
      </div>

      <div>
        <label htmlFor="content" className={LABEL}>
          Isi
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={4}
          maxLength={MAX_ANNOUNCEMENT_CONTENT_LENGTH}
          placeholder="Apa yang perlu kelas tahu?"
          className={`${INPUT} mt-1.5 resize-y`}
        />
        <FieldError errors={state.fieldErrors?.content} />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
        >
          Siarkan pengumuman
        </button>

        <p className="text-xs text-muted">
          Langsung tayang di /feed, /media, dan setiap halaman komentar sampai diarsipkan.
        </p>

        <FormMessage message={state.message} />
      </div>
    </form>
  );
}