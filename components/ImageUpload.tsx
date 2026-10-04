"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ALLOWED_IMAGE_TYPES, compressImage } from "@/lib/image";

/**
 * Picking and compressing one image for a composer.
 *
 * Two pieces, because the form needs both and only the form can have them:
 *
 * - `useImageAttachment` owns the state. A composer needs to know whether there is an
 *   image (a post can be a picture and no words) and whether one is still being
 *   compressed (there is nothing to submit yet), and neither is a question a presentational
 *   child can answer without a subscription.
 * - `ImageUpload` owns the mechanics: the hidden file input, the button that opens it, and
 *   whatever the compressor said.
 *
 * The picture itself is `ImagePreview`'s job, mounted by the caller wherever the draft is
 * read, rather than here where the button is.
 *
 * The compressed `File` is deliberately not smuggled through the file input. React resets
 * a form once its action settles, which empties `input.files` behind our back, so a retry
 * after a failed post would go out with the caption and no picture. Instead the form's
 * action puts the `File` from this state into the `FormData` it is about to submit, which
 * also means a pick that failed to compress cannot leak its uncompressed original: an
 * unnamed input never appears in the payload at all.
 */
export type ImageAttachment = {
  /** `compressing` is the one state with work outstanding; the rest are settled. */
  status: "idle" | "compressing" | "ready";
  /** The compressed bytes, which is what gets submitted. Null until it is `ready`. */
  file: File | null;
  /** Object URL of `file`. Null whenever `file` is null. */
  previewUrl: string | null;
  /** Size of the pick as it came off disk, so the preview can report what was saved. */
  originalBytes: number | null;
  /** A pick that failed, in the words `compressImage` chose. */
  error: string | null;
};

const EMPTY: ImageAttachment = {
  status: "idle",
  file: null,
  previewUrl: null,
  originalBytes: null,
  error: null,
};

export function useImageAttachment(): {
  attachment: ImageAttachment;
  inputRef: RefObject<HTMLInputElement | null>;
  select: (file: File) => Promise<void>;
  clear: () => void;
} {
  const [attachment, setAttachment] = useState<ImageAttachment>(EMPTY);
  const inputRef = useRef<HTMLInputElement>(null);

  // An object URL stays alive until it is revoked, and replacing the picture is how these
  // leak, so the live one is held outside the state that describes it.
  const previewRef = useRef<string | null>(null);
  // Compression is async, so a second pick can overtake a first one; each pick takes a
  // number and only the newest is allowed to write.
  const pickRef = useRef(0);
  // A compression that finishes after the composer is gone has nowhere to show its result.
  const liveRef = useRef(true);

  const releasePreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);

  // The composer is remounted on a successful send (`key={state.successToken}`), and the
  // preview dies with it unless it is revoked first.
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      releasePreview();
    };
  }, [releasePreview]);

  const select = useCallback(
    async (source: File) => {
      const pick = ++pickRef.current;

      setAttachment({
        status: "compressing",
        file: null,
        previewUrl: null,
        originalBytes: source.size,
        error: null,
      });

      let compressed;
      try {
        compressed = await compressImage(source);
      } catch (error) {
        if (pick === pickRef.current) {
          setAttachment({
            ...EMPTY,
            error: error instanceof Error ? error.message : "Gambarnya gagal diproses.",
          });
        }
        return;
      }

      if (pick !== pickRef.current) return;

      releasePreview();
      const previewUrl = URL.createObjectURL(compressed.file);

      if (!liveRef.current) {
        URL.revokeObjectURL(previewUrl);
        return;
      }

      previewRef.current = previewUrl;
      setAttachment({
        status: "ready",
        file: compressed.file,
        previewUrl,
        originalBytes: compressed.originalBytes,
        error: null,
      });
    },
    [releasePreview],
  );

  const clear = useCallback(() => {
    // Any compression still in flight describes a picture that is no longer attached.
    pickRef.current += 1;
    releasePreview();
    if (inputRef.current) inputRef.current.value = "";
    setAttachment(EMPTY);
  }, [releasePreview]);

  return { attachment, inputRef, select, clear };
}

/** The picker: one button, and the compressor's verdict when it has one. */
export function ImageUpload({
  attachment,
  inputRef,
  onSelect,
  disabled = false,
  label = "Gambar",
}: {
  attachment: ImageAttachment;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (file: File) => Promise<void>;
  /** The form is sending: another pick would attach to a payload already on its way. */
  disabled?: boolean;
  label?: string;
}) {
  const busy = disabled || attachment.status === "compressing";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {/*
        No `name`: this input exists to open the system picker and nothing else. The bytes
        reach the Server Action through `attachment.file`, which is why the form has to be
        the one to put them in the payload.
      */}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file twice still raises a change event.
          event.target.value = "";
          if (file) void onSelect(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy || undefined}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <ImageIcon />
        {busy ? "Mengompres..." : label}
      </button>

      {attachment.error ? (
        <p role="alert" className="text-xs text-accent">
          {attachment.error}
        </p>
      ) : null}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="size-4" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path
        d="M4.5 17.5l4.7-4.7a1.6 1.6 0 0 1 2.3 0l3.5 3.5 1.9-1.9a1.6 1.6 0 0 1 2.3 0l2.3 2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
