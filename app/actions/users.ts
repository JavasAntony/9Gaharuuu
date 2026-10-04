"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MISSING_SECRET_KEY, createAdminClient } from "@/lib/supabase/admin";
import { requireAdminId } from "@/lib/auth";
import { IMAGE_BUCKET } from "@/lib/images";
import { banUntilFor } from "@/lib/bans";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/constants";
import {
  banSchema,
  roleChangeSchema,
  unbanSchema,
  userCreateSchema,
} from "@/lib/validation";
import { type ActionState } from "@/lib/action-state";

/**
 * Admin account management.
 *
 * Everything here falls into one of two shapes, and the difference is the whole design:
 *
 *   * **An RPC.** Banning, unbanning, a role change, and the audit row for a creation.
 *     `private.is_admin()` inside each function is the boundary; the guard here is UX.
 *   * **The Auth Admin API.** Actually creating and deleting an account, because those are
 *     statements about `auth.users` and no policy can express them. See `lib/supabase/admin.ts`
 *     for why that is survivable.
 *
 * The rule that shapes every function below: **the database says yes before the secret key
 * is touched.** `periksa_admin()` runs first, over the caller's own publishable-key JWT, and
 * if it raises the action stops -- before an account has been created, or before one has been
 * destroyed. The reverse order would leave the check unable to stop anything.
 *
 * Moderation actions live in `app/actions/admin.ts` and stay there: those are about content,
 * these are about accounts.
 */

/**
 * SQLSTATE -> Indonesian message.
 *
 * The codes are the RPCs' own vocabulary from 0017, and the app reads *only* the code --
 * never the exception text, because text is what somebody edits in a later migration
 * without noticing what depends on it. Four of them say something specific here:
 *
 *   * `42501` -- the caller is not an admin. The role is re-checked inside every function
 *     by `private.is_admin()`, so this is what a member calling the action directly gets.
 *   * `P0003` -- the caller named their own account. Deliberately *not* folded into
 *     `42501`: "you are not an admin" and "you may not do that to yourself" are different
 *     facts, and a member who banned themselves needs to be told which one happened.
 *   * `P0004` -- refusing to lock the class out of itself: the target is the last admin who
 *     is not already banned, so banning or demoting them would leave nobody able to lift it.
 *   * `23505` -- the unique index on `profiles.username`. Two classmates cannot share a
 *     name, and this is the only layer that knows it.
 *
 * `P0002` (target gone) and `22023` (an argument the function rejects) fall through to the
 * per-action fallback, which is worded for the form that produced it.
 */
function pesanKegagalan(error: { code?: string }, fallback: string): string {
  switch (error.code) {
    case "42501":
      return "Kamu bukan admin.";
    case "P0003":
      return "Kamu tidak bisa melakukan itu pada akun sendiri.";
    case "P0004":
      return "Itu admin terakhir yang masih aktif, jadi harus ada admin lain dulu.";
    case "P0002":
      return "Akun itu sudah tidak ada.";
    case "23505":
      return "Username itu sudah dipakai. Pilih yang lain.";
    default:
      return fallback;
  }
}

/** The one Indonesian string for a missing secret key, wherever it surfaces. */
const SECRET_KEY_MESSAGE =
  "Fitur ini butuh SUPABASE_SECRET_KEY di server. Tanya admin yang menyiapkan project.";

/**
 * Confirm with the database that the caller is an admin, using the caller's own JWT.
 *
 * Separate from `requireAdminId()` on purpose: that one reads the `me` view and is a
 * convenience for hiding UI, while this one is the check the destructive operations depend
 * on. It has to run on a connection carrying the caller's token, so it goes through the
 * ordinary publishable-key client rather than the service-role one.
 */
async function authorizeAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("periksa_admin");

  if (error) return { ok: false, message: pesanKegagalan(error, "Gagal memeriksa izin admin.") };
  return { ok: true };
}

function revalidateAccounts(): void {
  revalidatePath("/admin/pengguna");
  revalidatePath("/admin");
  // A ban or a deletion changes what is on the timeline, so the feeds are the other thing
  // that can be stale after this.
  revalidatePath("/feed");
  revalidatePath("/media");
}

/**
 * Create an account.
 *
 * Auth identity is the same synthetic email the login screen builds from a username, so the
 * new classmate signs in with a username and a password and never sees an address. The
 * password is set here because there is no signup form anywhere in the app.
 *
 * The order is the security argument and it is not negotiable:
 *
 *   1. Validate the form. Nothing is sent anywhere for input the database would only refuse.
 *   2. `periksa_admin()`. The account does not exist yet, so a member calling this action
 *      directly gets nothing.
 *   3. Create the auth user. `on_auth_user_created` has already made its profile row by the
 *      time this returns, with role `member`.
 *   4. `simpan_akun_baru()` applies the requested role and writes the audit row.
 *
 * Step 4 is the only one that can fail after the account exists, so its failure deletes the
 * account again. Without that, a half-created account would be left behind: real, signable,
 * and with no audit row explaining it -- the one outcome that is worse than an error.
 */
async function jalankanBuatAkun(
  username: string,
  password: string,
  role: string,
): Promise<ActionState> {
  const parsed = userCreateSchema.safeParse({ username, password, role });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Periksa lagi isianmu.",
    };
  }

  const authorized = await authorizeAdmin();
  if (!authorized.ok) return { message: authorized.message };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    if (error instanceof Error && error.message === MISSING_SECRET_KEY) {
      return { message: SECRET_KEY_MESSAGE };
    }
    throw error;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${parsed.data.username}@${SYNTHETIC_EMAIL_DOMAIN}`,
    password: parsed.data.password,
    email_confirm: true,
    // The trigger reads the username out of here, which is what creates the profile row.
    user_metadata: { username: parsed.data.username },
  });

  if (createError || !created?.user) {
    return { message: "Gagal membuat akun. Username mungkin sudah dipakai." };
  }

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("simpan_akun_baru", {
    p_user_id: created.user.id,
    p_username: parsed.data.username,
    p_role: parsed.data.role,
  });

  if (saveError) {
    // Undo step 3. The profile write is what failed, so the account exists but has no role
    // and no audit row -- worse than not having created it.
    await admin.auth.admin.deleteUser(created.user.id);
    return { message: pesanKegagalan(saveError, "Gagal menyiapkan akunnya. Coba lagi sebentar.") };
  }

  revalidateAccounts();
  return { successToken: crypto.randomUUID() };
}

/**
 * Delete an account, and everything it owned.
 *
 * `DELETE FROM auth.users` is the whole cascade: `profiles.id` cascades from it, and
 * `posts.user_id`, `comments.user_id`, `likes.user_id`, `guest_likes.user_id` and
 * `reports.reporter_id` all cascade from the profile. Nothing in this action touches a
 * content table, and it does not need to -- which is why it cannot leave a post behind that
 * points at a person who no longer exists.
 *
 * Images are the exception, because storage objects are files rather than rows: deleting
 * the account does not unlink them. They are removed over the Storage API from the account's
 * own folder, which is `<userId>/<uuid>.<ext>` by construction in `lib/images.ts`.
 *
 * The pre-check runs before the deletion, not after, for the same reason the ban guards
 * refuse self-targeting: an admin who deletes their own account leaves nobody able to undo
 * it. `periksa_hapus_akun` raises 42501 for that case while the account is still there.
 */
async function jalankanHapusAkun(targetId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: username, error: checkError } = await supabase.rpc("periksa_hapus_akun", {
    p_user_id: targetId,
  });

  if (checkError) {
    return { message: pesanKegagalan(checkError, "Gagal memeriksa akun itu.") };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    if (error instanceof Error && error.message === MISSING_SECRET_KEY) {
      return { message: SECRET_KEY_MESSAGE };
    }
    throw error;
  }

  // Best effort, and deliberately before the delete: once the profile is gone there is no
  // row anywhere that knows which files this account uploaded, so the folder name is the
  // only handle left. If this fails the account still goes -- a missing file costs storage,
  // not correctness, and refusing to delete an account over it would be worse.
  await kosongkanFolderGambar(admin, targetId);

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
  if (deleteError) {
    return { message: "Gagal menghapus akun. Coba lagi sebentar." };
  }

  // After, not before: the audit row should describe what happened, not what was attempted.
  const { error: logError } = await supabase.rpc("catat_hapus_akun", {
    p_user_id: targetId,
    p_username: typeof username === "string" ? username : "",
  });

  if (logError) {
    // The account is gone either way. Saying so is the honest answer: an admin who reads
    // this message knows the deletion happened and that the trail for it is missing.
    return {
      message: "Akunnya sudah dihapus, tapi gagal dicatat di riwayat. Cek log server.",
    };
  }

  revalidateAccounts();
  return { successToken: crypto.randomUUID() };
}

/**
 * Removes every object under `<userId>/` in the bucket, following the layout `lib/images.ts`
 * writes. Paged, because a chatty member's folder is not a handful of files.
 */
async function kosongkanFolderGambar(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const bucket = admin.storage.from(IMAGE_BUCKET);

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(userId, { limit: 1000, offset });

    if (error || !data || data.length === 0) return;

    const paths = data
      .filter((entry) => entry.id !== null)
      .map((entry) => `${userId}/${entry.name}`);

    if (paths.length > 0) await bucket.remove(paths);
    if (data.length < 1000) return;
  }
}

/**
 * Ban an account, permanently or for a preset duration.
 *
 * The preset becomes `banned_until`: null for "permanen", a timestamp otherwise. Nothing
 * here expires the ban -- `private.akun_terblokir()` reads the end date on every write, so a
 * temporary ban needs no job and cannot be left behind by one that failed to run.
 *
 * The RPC decides everything that matters, and refuses three things this file does not have
 * to guess about: a non-admin, your own account, and the last unbanned admin.
 */
async function jalankanBlokir(
  targetId: string,
  duration: string,
  reason: string,
): Promise<ActionState> {
  const parsed = banSchema.safeParse({ targetId, duration, reason });
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
  const { error } = await supabase.rpc("blokir_akun", {
    p_user_id: parsed.data.targetId,
    p_sampai: banUntilFor(parsed.data.duration),
    p_alasan: parsed.data.reason.length ? parsed.data.reason : null,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal memblokir akun.") };
  }

  revalidateAccounts();
  return { successToken: crypto.randomUUID() };
}

/** Lift a ban early, whether it was temporary or permanent. */
async function jalankanBukaBlokir(targetId: string, reason: string | undefined): Promise<ActionState> {
  const parsed = unbanSchema.safeParse({ targetId, reason });
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
  const { error } = await supabase.rpc("buka_blokir_akun", {
    p_user_id: parsed.data.targetId,
    p_alasan: parsed.data.reason?.length ? parsed.data.reason : null,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal membuka blokir.") };
  }

  revalidateAccounts();
  return { successToken: crypto.randomUUID() };
}

/**
 * Move an account between `member` and `admin`.
 *
 * A role change is the most dangerous thing on this page, because an admin who promotes a
 * classmate has just handed out the ability to delete anybody's post. It is still one RPC
 * and no extra confirmation dialog -- the audit row is the record, and a dialog for every
 * role change would train people to dismiss dialogs.
 */
async function jalankanUbahPeran(targetId: string, role: string): Promise<ActionState> {
  const parsed = roleChangeSchema.safeParse({ targetId, role });
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
  const { error } = await supabase.rpc("ubah_peran_akun", {
    p_user_id: parsed.data.targetId,
    p_role: parsed.data.role,
  });

  if (error) {
    return { message: pesanKegagalan(error, "Gagal mengubah peran.") };
  }

  revalidateAccounts();
  return { successToken: crypto.randomUUID() };
}

// ---------------------------------------------------------------------------
// Form bindings
// ---------------------------------------------------------------------------

/** Account form binding, for `useActionState`. */
export async function buatAkun(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanBuatAkun(
    String(formData.get("username") ?? ""),
    String(formData.get("password") ?? ""),
    String(formData.get("role") ?? ""),
  );
}

/** Per-row binding, for `useActionState`. */
export async function blokirAkun(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanBlokir(
    String(formData.get("targetId") ?? ""),
    String(formData.get("duration") ?? ""),
    (formData.get("reason") as string | null) ?? "",
  );
}

/** Per-row binding, for `useActionState`. */
export async function bukaBlokirAkun(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanBukaBlokir(
    String(formData.get("targetId") ?? ""),
    (formData.get("reason") as string | null) ?? undefined,
  );
}

/** Per-row binding, for `useActionState`. */
export async function ubahPeranAkun(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return jalankanUbahPeran(
    String(formData.get("targetId") ?? ""),
    String(formData.get("role") ?? ""),
  );
}

/**
 * Action-only binding for the delete confirmation sheet, where there is no form state to
 * report back to.
 *
 * Shaped for `ConfirmDialog`, which wants "the reason it failed, or null" -- the mirror image
 * of `hapusKontenOtoritas`, which has nowhere to show one and swallows it.
 */
export async function hapusAkunLangsung(targetId: string): Promise<string | null> {
  const result = await jalankanHapusAkun(targetId);
  return result.successToken ? null : (result.message ?? "Gagal menghapus akun.");
}