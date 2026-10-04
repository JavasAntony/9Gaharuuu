import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  extensionFor,
} from "@/lib/image";

/**
 * Uploading a post image, server side.
 *
 * Server-only by convention rather than by the `server-only` package, which this project
 * does not depend on: nothing in here runs in a browser, and `lib/image.ts` is the module
 * a Client Component is meant to import.
 *
 * The client compresses and sends a `File`; this turns that into a public URL. Doing the
 * upload here rather than in the browser is the whole security argument: the publishable
 * key is public, so a client-side upload path is an endpoint anyone can call with
 * anything, whereas here the path is derived from the session, the type is checked
 * against a list the caller does not control, and an anonymous visitor never reaches it
 * at all -- `storage.objects` grants INSERT to `authenticated` only.
 *
 * The object path is `<userId>/<uuid>.<ext>`. The first segment is what the storage
 * policies key on, so a member cannot write into another member's folder; the uuid means
 * a re-upload never overwrites an existing image, which is why there is no UPDATE policy
 * on the bucket.
 */
export const IMAGE_BUCKET = "post-images";

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Reads a `FormData` entry as a real file, or null when there isn't one. */
export function readImageField(formData: FormData, field = "image"): File | null {
  const value = formData.get(field);
  if (!(value instanceof File)) return null;
  // An empty file input submits a File with no name and zero bytes.
  if (value.size === 0) return null;
  return value;
}

/**
 * Uploads and returns the public URL, or an Indonesian message to show.
 *
 * The size check is a courtesy rather than the boundary: the bucket's `file_size_limit`
 * rejects anything over 1 MiB regardless of what this says, and the compressed file
 * should be well under half that.
 */
export async function uploadPostImage(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<UploadResult> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Formatnya harus JPEG, PNG, atau WebP." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: "Gambarnya masih kebesaran. Pilih foto yang lebih ringan ya.",
    };
  }

  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return { ok: false, message: "Gambarnya gagal diunggah. Coba lagi sebentar." };
  }

  return {
    ok: true,
    url: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

/**
 * Best-effort removal, used when a post fails to save after its image uploaded.
 *
 * Silently ignoring the failure is deliberate: this runs on an error path where the row
 * is already lost, and reporting "could not clean up" on top of "could not post" would
 * only confuse. The alternative -- leaving the object -- costs storage, not correctness,
 * because nothing references it.
 */
export async function discardUploadedImage(
  supabase: SupabaseClient,
  url: string | null,
): Promise<void> {
  if (!url) return;

  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;

  const path = url.slice(at + marker.length);
  if (!path) return;

  await supabase.storage.from(IMAGE_BUCKET).remove([path]);
}