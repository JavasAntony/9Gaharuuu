"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminId } from "@/lib/auth";
import { moderationDeleteSchema, moderationSchema } from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

/**
 * SQLSTATE -> Indonesian message.
 *
 * The RPCs raise on purpose instead of returning quietly, so the code is the only
 * way to tell "you are not allowed" apart from "that row is gone" apart from "the
 * database is unhappy". `42501` is what both moderation RPCs raise for a
 * non-admin, `P0002` for a missing row, `22023` for an argument the function
 * rejects.
 */
function pesanKegagalan(error: { code?: string }, fallback: string): string {
  switch (error.code) {
    case "42501":
      return "Kamu bukan admin.";
    case "P0002":
      return "Konten itu sudah tidak ada.";
    case "22023":
      return "Aksi tidak valid.";
    default:
      return fallback;
  }
}

/**
 * Move a report along.
 *
 * `requireAdminId` is the cheap UI-level check. The real one is
 * `private.is_admin()` inside the RPC, which also stamps `resolved_by` from
 * `auth.uid()` and appends to `moderation_logs`. A member calling this directly
 * gets 42501 from the database even with a forged request.
 *
 * No report row is read or written here: the RPC takes the report id and the new
 * status and does the transition, so a client cannot also set `resolved_at` or
 * attribute the action to another admin.
 */
async function jalankanTinjau(reportId: string, status: string): Promise<ActionState> {
  const parsed = moderationSchema.safeParse({ reportId, status });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Aksi tidak valid.",
    };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();

  // Returns the acting admin id, which is only used as an audit value: the
  // database stamps it, so there is nothing for the caller to add to it.
  const { error } = await supabase.rpc("tinjau_laporan", {
    p_report_id: parsed.data.reportId,
    p_status: parsed.data.status,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal memperbarui laporan.") };
  }

  // The queue, the status filter counts and the guest-post list on the same page
  // all read through these paths.
  revalidatePath("/admin");
  return { successToken: crypto.randomUUID() };
}

/**
 * Remove a post, comment, guest post or guest reply as an admin.
 *
 * This is the only way anything gets deleted anywhere in the app. `posts` and
 * `comments` grant DELETE to nobody and their only delete policy is
 * `private.is_admin()`, so an owner cannot delete their own row either -- the
 * affordance would have been a button that silently does nothing.
 *
 * Goes through `public.hapus_konten` rather than a plain DELETE so the removal is
 * written to `moderation_logs` with the admin id, which a direct delete can never
 * do. The RPC also re-checks the role, so this is the audit trail, not the
 * boundary.
 */
async function jalankanHapus(
  kind: string,
  targetId: string,
  reason: string | undefined,
): Promise<ActionState> {
  const parsed = moderationDeleteSchema.safeParse({ kind, targetId, reason });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Aksi tidak valid.",
    };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();

  // The RPC returns the id of the post page that needs revalidating, or null for a
  // guest post. Null is the correct answer there, not an oversight: a guest post is
  // not in `posts`, so `/post/<id>` is a 404 and there is no page to invalidate.
  const { data, error } = await supabase.rpc("hapus_konten", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.targetId,
    p_reason: parsed.data.reason?.length ? parsed.data.reason : null,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal menghapus konten.") };
  }

  // Deleting a comment changes the thread's comment list and the feed's comment
  // count; deleting a post changes the feed and its own (now gone) thread page.
  revalidatePath("/feed");
  if (typeof data === "string") revalidatePath(`/post/${data}`);
  revalidatePath("/admin");
  return { successToken: crypto.randomUUID() };
}

/** Dashboard form binding, for `useActionState`. */
export async function tinjauLaporan(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanTinjau(
    String(formData.get("reportId") ?? ""),
    String(formData.get("status") ?? ""),
  );
}

/** Dashboard form binding, for `useActionState`. */
export async function hapusKonten(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanHapus(
    String(formData.get("kind") ?? ""),
    String(formData.get("targetId") ?? ""),
    (formData.get("reason") as string | null) ?? undefined,
  );
}

/**
 * Action-only binding for the `⋮` menu, where there is no form state to report
 * back to. Same checks, same RPC, same audit trail; failures are swallowed because
 * there is nowhere to show them -- the item closes the menu and the list the
 * removal came from is revalidated either way.
 */
export async function hapusKontenOtoritas(
  kind: "post" | "comment" | "guest_post" | "guest_comment",
  targetId: string,
  reason?: string,
): Promise<void> {
  await jalankanHapus(kind, targetId, reason);
}