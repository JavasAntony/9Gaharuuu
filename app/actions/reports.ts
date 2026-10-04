"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { reportSchema } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

/**
 * File a report about a post or a comment.
 *
 * No reporter, status or resolver field is accepted from the form. `public.
 * buat_laporan` stamps `reporter_id` from `auth.uid()`, and the `reports` table
 * has no client grant at all, so a caller cannot report as somebody else, cannot
 * set its own status to resolved, and cannot write `resolved_by`.
 */
export async function laporkanKonten(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireUserId();
  } catch {
    return { message: "Masuk dulu untuk melapor." };
  }

  const parsed = reportSchema.safeParse({
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Laporan belum lengkap.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("buat_laporan", {
    p_post_id: parsed.data.targetKind === "post" ? parsed.data.targetId : null,
    p_comment_id: parsed.data.targetKind === "comment" ? parsed.data.targetId : null,
    p_reason: parsed.data.reason,
    p_description: parsed.data.description?.length ? parsed.data.description : null,
  });

  if (error) {
    // The function turns a duplicate report into a silent success, so anything
    // that reaches here is a real failure.
    if (error.code === "P0002") return { message: "Konten itu sudah tidak ada." };
    return { message: "Gagal mengirim laporan. Coba lagi sebentar." };
  }

  revalidatePath("/admin");
  return { successToken: crypto.randomUUID() };
}