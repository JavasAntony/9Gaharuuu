"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { idSchema, postSchema } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

function parseAnonymous(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

/**
 * Create a post.
 *
 * `id` is generated here rather than returned by the database: the column grants
 * omit `user_id` and RLS policy expressions are part of the query, so
 * `.insert().select()` would raise instead of returning a row. `RETURNING` also
 * requires the new row to satisfy the SELECT policy.
 */
export async function buatPost(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireUserId();
  } catch {
    return { message: "Sesi kamu habis. Masuk lagi ya." };
  }

  const parsed = postSchema.safeParse({
    content: formData.get("content"),
    anonymous: parseAnonymous(formData.get("anonymous")),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("posts").insert({
    id: crypto.randomUUID(),
    content: parsed.data.content,
    anonymous: parsed.data.anonymous,
  });

  if (error) return { message: "Gagal menyimpan. Coba lagi sebentar." };

  revalidatePath("/feed");
  return { successToken: crypto.randomUUID() };
}

/**
 * Delete a post. Filtering on `id` only: `user_id` cannot appear in the filter
 * because the client has no SELECT grant on it. Ownership is enforced by the
 * "owners delete posts" RLS policy, so deleting somebody else's post is a
 * no-op rather than an error.
 */
export async function hapusPost(postId: string): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  try {
    await requireUserId();
  } catch {
    return;
  }

  const supabase = await createClient();
  await supabase.from("posts").delete().eq("id", parsed.data);

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data}`);
}

export async function sukaPost(postId: string): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return;
  }

  const supabase = await createClient();
  // A duplicate like raises 23505 and is deliberately ignored: liking twice is
  // a no-op, not an error the reader needs to see.
  await supabase.from("likes").insert({ user_id: userId, post_id: parsed.data });

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data}`);
}

export async function batalSukaPost(postId: string): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("likes")
    .delete()
    .eq("post_id", parsed.data)
    .eq("user_id", userId);

  revalidatePath("/feed");
  revalidatePath(`/post/${parsed.data}`);
}
