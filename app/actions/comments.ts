"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { commentSchema, idSchema } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

function parseBoolean(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}

export async function tambahKomentar(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireUserId();
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

  const supabase = await createClient();

  // No `.select()`: column grants make RETURNING raise rather than return empty.
  // The database rejects a parent comment that belongs to a different post.
  const { error } = await supabase.from("comments").insert({
    id: crypto.randomUUID(),
    post_id: parsed.data.postId,
    parent_comment_id: parsed.data.parentCommentId,
    content: parsed.data.content,
    anonymous: parsed.data.anonymous,
  });

  if (error) {
    if (error.code === "23514") {
      return { message: "Balasan harus berada di post yang sama." };
    }
    return { message: "Gagal menyimpan. Coba lagi sebentar." };
  }

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data.postId}`);
  return { successToken: crypto.randomUUID() };
}

/**
 * Deleting a parent cascades to its replies. As with posts, the filter may only
 * use granted columns, so ownership is left entirely to the RLS policy.
 */
export async function hapusKomentar(commentId: string): Promise<void> {
  const parsed = idSchema.safeParse(commentId);
  if (!parsed.success) return;

  try {
    await requireUserId();
  } catch {
    return;
  }

  const supabase = await createClient();
  // Read the parent post first so the right detail page can be revalidated.
  const { data, error: readError } = await supabase
    .from("comment_thread")
    .select("post_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (readError) return;
  if (!data?.post_id) return;

  await supabase.from("comments").delete().eq("id", parsed.data);

  revalidatePath("/feed");
  revalidatePath(`/post/${data.post_id}`);
}