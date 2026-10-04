"use client";

import { formatBytes } from "@/lib/image";
import type { ImageAttachment } from "./ImageUpload";

/**
 * The picture attached to a draft, before it has been uploaded.
 *
 * Deliberately a separate component from `ImageUpload`: the picker belongs in the
 * composer's toolbar, where the anonymity toggle is, while the picture belongs above the
 * textarea where it is actually being looked at. Keeping them apart lets a caller put the
 * two where they belong instead of where the component wants them.
 *
 * Renders nothing when there is no picture, so a caller can mount it unconditionally.
 *
 * The `rise` on the caption is not decoration: the caption is the only place the reader
 * learns what compression did to their file, and it appears one frame after the picture
 * does. Without the transition the two arrive as a single jump and the number reads as
 * part of the image.
 */
export function ImagePreview({
  attachment,
  onClear,
  disabled = false,
  alt = "Pratinjau gambar yang dilampirkan",
}: {
  attachment: ImageAttachment;
  onClear: () => void;
  /** While the form is sending, the bytes in this payload are already decided. */
  disabled?: boolean;
  alt?: string;
}) {
  if (!attachment.previewUrl || !attachment.file) return null;

  const compressedBytes = attachment.file.size;
  const originalBytes = attachment.originalBytes ?? compressedBytes;
  const saved = originalBytes > compressedBytes;

  return (
    <figure className="animate-rise flex w-fit flex-col gap-1">
      <div className="relative">
        {/* A plain `<img>` for the same reason `PostCard` uses one: the bytes here were
            compressed in the browser already, so there is nothing for the optimizer to
            shrink, and the picture keeps its own proportions instead of filling a box. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.previewUrl}
          alt={alt}
          className="max-h-72 w-auto rounded-xl border border-line object-contain"
        />

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label="Hapus gambar"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm ring-1 ring-line transition-colors hover:text-accent active:scale-95 disabled:opacity-50"
        >
          <CloseIcon />
        </button>
      </div>

      <figcaption className="text-xs text-muted">
        {saved
          ? `${formatBytes(compressedBytes)} · dari ${formatBytes(originalBytes)}`
          : formatBytes(compressedBytes)}
      </figcaption>
    </figure>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4" aria-hidden="true">
      <path d="M6.5 6.5l11 11m0-11l-11 11" strokeLinecap="round" />
    </svg>
  );
}