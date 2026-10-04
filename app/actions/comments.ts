"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import {
  commentSchema,
  EMPTY_POST_MESSAGE,
  guestCommentSchema,
  hasTextOrImage,
} from "@/lib/validation";
import { discardUploadedImage, readImageField, uploadPostImage } from "@/lib/images";
import { type ActionState } from "@/lib/action-state";

/**
 * Writing to comments. There is no delete here on purpose: `authenticated` holds no
 * DELETE grant on `comments` and the only delete policy calls `private.is_admin()`,
 * so removal runs through `public.hapus_konten` and is logged. See
 * `hapusKontenOtoritas` in `app/actions/admin.ts`.
 */

function parseBoolean(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}

/**
 * A member comment, with text, an image, or both.
 *
 * `comments.post_id` has no foreign key -- migration 0010 replaced it with a trigger,
 * because one uuid cannot reference both `posts` and `guest_posts` and a guest post
 * deserves an answer as much as any other. The trigger is `security definer` and
 * raises 23503 for a target that exists in neither, which is the code handled below.
 *
 * The image follows the same order as on a post: uploaded first, and removed again if
 * the insert fails. The `image_url` column additionally has a CHECK constraint, so a
 * value that did not come from our bucket is refused by the database rather than being
 * stored and rendered on somebody else's device.
 */
export async function tambahKomentar(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const image = readImageField(formData);

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { message: "Sesi kamu habis. Masuk lagi ya." };
  }

  const parentRaw = formData.get("parentCommentId");
  const parsed = commentSchema.safeParse({
    postId: formData.get("postId"),
    parentCommentId: typeof parentRaw === "string" && parentRaw !== "" ? parentRaw : null,
    content: formData.get("content"),
    anonymous: parseBoolean(formData.get("anonymous")),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  if (!hasTextOrImage(parsed.data.content, image)) {
    return { message: EMPTY_POST_MESSAGE };
  }

  const supabase = await createClient();

  let imageUrl: string | null = null;
  if (image) {
    const uploaded = await uploadPostImage(supabase, userId, image);
    if (!uploaded.ok) return { message: uploaded.message };
    imageUrl = uploaded.url;
  }

  // No `.select()`: column grants make RETURNING raise rather than return empty.
  // The database rejects a parent comment that belongs to a different post, and a
  // `post_id` that names neither a member post nor a guest one.
  const { error } = await supabase.from("comments").insert({
    id: crypto.randomUUID(),
    post_id: parsed.data.postId,
    parent_comment_id: parsed.data.parentCommentId,
    content: parsed.data.content,
    image_url: imageUrl,
    anonymous: parsed.data.anonymous,
  });

  if (error) {
    await discardUploadedImage(supabase, imageUrl);
    if (error.code === "23514") {
      return { message: "Balasan harus berada di post yang sama." };
    }
    if (error.code === "23503") {
      return { message: "Postingan ini sudah tidak ada." };
    }
    return { message: "Gagal menyimpan. Coba lagi sebentar." };
  }

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data.postId}`);
  return { successToken: crypto.randomUUID() };
}

/**
 * A reply from a signed-out visitor.
 *
 * Goes to `public.guest_comments` rather than `comments`, so the row has no
 * author column to leak and no `anonymous` flag to set -- the table only accepts
 * text. `anon` holds INSERT on exactly four columns and no SELECT at all, so
 * this cannot be turned into a way to write anything else.
 *
 * The database owns every judgement here: the foreign key rejects a post that
 * does not exist (or a guest post, which is not in `posts`), the trigger rejects
 * a parent from another post or from no post at all, and the insert policy
 * enforces the per-address hourly ceiling. A rejection therefore arrives as an
 * error code, not as a silent no-op, so each one gets its own message.
 */
export async function tambahBalasanTamu(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parentRaw = formData.get("parentCommentId");
  const parsed = guestCommentSchema.safeParse({
    postId: formData.get("postId"),
    parentCommentId: typeof parentRaw === "string" && parentRaw !== "" ? parentRaw : null,
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  const supabase = await createClient();

  // No `.select()`: column grants make RETURNING raise rather than return empty.
  const { error } = await supabase.from("guest_comments").insert({
    id: crypto.randomUUID(),
    post_id: parsed.data.postId,
    parent_comment_id: parsed.data.parentCommentId,
    content: parsed.data.content,
  });

  if (error) {
    if (error.code === "23514") {
      return { message: "Balasan harus berada di post yang sama." };
    }
    if (error.code === "23503") {
      return { message: "Postingan ini sudah tidak ada." };
    }
    if (error.code === "42501") {
      return { message: "Terlalu banyak balasan tamu baru saja. Coba lagi nanti." };
    }
    return { message: "Gagal menyimpan. Coba lagi sebentar." };
  }

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data.postId}`);
  return { successToken: crypto.randomUUID() };
}