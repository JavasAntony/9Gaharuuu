"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminId } from "@/lib/auth";
import {
  announcementEditSchema,
  announcementSchema,
  announcementTargetSchema,
} from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

/**
 * Admin announcement management.
 *
 * Four writes, four RPCs, one shape: parse the form, check the role, call the function,
 * revalidate. No announcement table is ever touched from here directly -- `announcements`
 * holds no client grant at all, so every write goes through a `security definer` function
 * that stamps `author_id` from `auth.uid()`. That is what makes it impossible for an admin
 * to publish an announcement under somebody else's name.
 *
 * Archiving is the reversible option and the one the manager offers first; `hapusPengumuman`
 * is permanent and sits behind a confirmation.
 *
 * These revalidate the public routes as well as `/admin`, because an announcement is read on
 * `/feed`, `/media` and every post thread -- `active_announcements` sits in the `(publik)`
 * layout, so one stale render there shows the whole class yesterday's news.
 */
function pesanKegagalan(error: { code?: string }, fallback: string): string {
  switch (error.code) {
    case "42501":
      return "Kamu bukan admin.";
    case "P0002":
      return "Pengumuman itu sudah tidak ada.";
    case "22023":
      return "Judul atau isinya kepanjangan.";
    default:
      return fallback;
  }
}

function revalidateAnnouncements(): void {
  revalidatePath("/admin/pengumuman");
  revalidatePath("/admin");
  revalidatePath("/feed");
  revalidatePath("/media");
}

async function jalankanBuat(
  title: string,
  content: string,
): Promise<ActionState> {
  const parsed = announcementSchema.safeParse({ title, content });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Periksa lagi isianmu.",
    };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();

  // Nothing is selected afterwards: `RETURNING` raises under column-level grants, and the
  // manager reads back through `admin_announcements` after the revalidation.
  const { error } = await supabase.rpc("buat_pengumuman", {
    p_judul: parsed.data.title,
    p_isi: parsed.data.content,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal membuat pengumuman.") };
  }

  revalidateAnnouncements();
  return { successToken: crypto.randomUUID() };
}

async function jalankanUbah(
  announcementId: string,
  title: string,
  content: string,
): Promise<ActionState> {
  const parsed = announcementEditSchema.safeParse({ announcementId, title, content });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Periksa lagi isianmu.",
    };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ubah_pengumuman", {
    p_id: parsed.data.announcementId,
    p_judul: parsed.data.title,
    p_isi: parsed.data.content,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal menyimpan pengumuman.") };
  }

  revalidateAnnouncements();
  return { successToken: crypto.randomUUID() };
}

/**
 * Archive or restore. One action, one toggle, and the RPC names the audit row from the new
 * state so the trail says what happened rather than what was requested.
 */
async function jalankanToggle(announcementId: string, active: string): Promise<ActionState> {
  const parsed = announcementTargetSchema.safeParse({ announcementId });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("toggle_pengumuman", {
    p_id: parsed.data.announcementId,
    p_aktif: active === "true",
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal mengubah status pengumuman.") };
  }

  revalidateAnnouncements();
  return { successToken: crypto.randomUUID() };
}

async function jalankanHapus(announcementId: string): Promise<ActionState> {
  const parsed = announcementTargetSchema.safeParse({ announcementId });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    await requireAdminId();
  } catch {
    return { message: "Kamu bukan admin." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("hapus_pengumuman", {
    p_id: parsed.data.announcementId,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal menghapus pengumuman.") };
  }

  revalidateAnnouncements();
  return { successToken: crypto.randomUUID() };
}

// ---------------------------------------------------------------------------
// Form bindings
// ---------------------------------------------------------------------------

export async function buatPengumuman(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanBuat(
    String(formData.get("title") ?? ""),
    String(formData.get("content") ?? ""),
  );
}

export async function ubahPengumuman(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanUbah(
    String(formData.get("announcementId") ?? ""),
    String(formData.get("title") ?? ""),
    String(formData.get("content") ?? ""),
  );
}

export async function togglePengumuman(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanToggle(
    String(formData.get("announcementId") ?? ""),
    String(formData.get("active") ?? ""),
  );
}


/**
 * Action-only binding for the delete confirmation sheet.
 *
 * Shaped for `ConfirmDialog`, which wants "the reason it failed, or null". Removing an
 * announcement is permanent, so unlike archiving it needs a question asked first.
 */
export async function hapusPengumumanLangsung(
  announcementId: string,
): Promise<string | null> {
  const result = await jalankanHapus(announcementId);
  return result.successToken ? null : (result.message ?? "Gagal menghapus pengumuman.");
}