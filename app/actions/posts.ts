"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUserId, requireWriterId } from "@/lib/auth";
import { BAN_WRITE_MESSAGE } from "@/lib/bans";
import { revalidateFeeds } from "@/lib/revalidate";
import {
  EMPTY_MEDIA_MESSAGE,
  EMPTY_TEXT_MESSAGE,
  IMAGE_NOT_ALLOWED_MESSAGE,
  guestPostSchema,
  hasImage,
  hasText,
  idSchema,
  postMediaSchema,
  postTeksSchema,
} from "@/lib/validation";
import { discardUploadedImage, readImageField, uploadPostImage } from "@/lib/images";
import { type ActionResult, type ActionState } from "@/lib/action-state";

/**
 * Writing to posts.
 *
 * There are two create actions, not one with a flag, because the two feeds disagree about
 * the same fields in both directions: `/feed` needs words and refuses pictures, `/media`
 * needs a picture and does not care about words. A `kind` parameter would have to be
 * checked before either rule could be checked at all, and the failure it cannot prevent is
 * a client that posts an image to the text feed's action.
 *
 * Each action therefore reads the image field *first* and rejects it or demands it, so the
 * route is enforced here and not only in the composer that is supposed to be calling.
 *
 * The one deletion here is a member removing their own post, and it is the one thing in
 * this file that is not a create: `hapusPost` below. Everything else here is a write.
 */

/**
 * SQLSTATE -> Indonesian message for the self-delete RPC.
 *
 * `42501` is the RPC's "not yours", `P0002` its "already gone". Both are worth telling
 * apart: one is a refusal and the other means the thing the reader wanted is what they
 * already have.
 */
function pesanHapus(error: { code?: string }): string {
  switch (error.code) {
    case "42501":
      return "Hanya kamu yang bisa menghapus posting ini.";
    case "P0002":
      return "Posting ini sudah tidak ada.";
    default:
      return "Gagal menghapus. Coba lagi sebentar.";
  }
}

/**
 * The refusal a write can come back with, from either layer.
 *
 * `42501` on an insert has exactly one source: `private.tolak_penulis_terblokir()` (0017),
 * the trigger that refuses posts, comments, likes and guest likes from a banned account. It
 * fires before the row exists, so a raw PostgREST call with the publishable key is refused
 * too -- which is why this mapping is a courtesy and not the boundary.
 *
 * The actions that write something before the row (a media post, a comment with an image)
 * check the ban up front with `requireWriterId()`, because a trigger cannot un-upload a
 * file. This mapping is the backstop for the paths that upload nothing.
 */
function pesanTulis(error: { code?: string }, fallback: string): string {
  if (error.code === "42501") return BAN_WRITE_MESSAGE;
  return fallback;
}

function parseAnonymous(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

/**
 * Create a post on `/feed`: words, and nothing else.
 *
 * The image field is read before anything else so that a forged or stale form carrying a
 * picture is refused rather than quietly filed. There is no `discardUploadedImage` on that
 * path because nothing was ever uploaded: the refusal happens before the upload, which is
 * the only place it can happen without leaving an orphan behind.
 *
 * `id` is generated here rather than returned by the database: the column grants
 * omit `user_id` and RLS policy expressions are part of the query, so
 * `.insert().select()` would raise instead of returning a row. `RETURNING` also
 * requires the new row to satisfy the SELECT policy.
 */
export async function buatPostTeks(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const image = readImageField(formData);

  if (image) return { message: IMAGE_NOT_ALLOWED_MESSAGE };

  const parsed = postTeksSchema.safeParse({
    content: formData.get("content"),
    anonymous: parseAnonymous(formData.get("anonymous")),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  // The schema's `min(1)` already covers this. It is repeated here for the same reason the
  // image rule is not: the two checks are the route's contract, and a schema edit that
  // loosened `min` should not silently make an empty post valid here.
  if (!hasText(parsed.data.content)) return { message: EMPTY_TEXT_MESSAGE };

  // The id is read but not used: there is no upload on this path, so the storage folder
  // has nothing to do with it. Reading it is still the point -- it is the check that the
  // session is real, and not a ban, before a row is written.
  try {
    await requireWriterId();
  } catch (error) {
    if (error instanceof Error && error.message === "BANNED") return { message: BAN_WRITE_MESSAGE };
    return { message: "Sesi kamu habis. Masuk lagi ya." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("posts").insert({
    id: crypto.randomUUID(),
    content: parsed.data.content,
    image_url: null,
    anonymous: parsed.data.anonymous,
  });

  if (error) {
    return { message: pesanTulis(error, "Gagal menyimpan. Coba lagi sebentar.") };
  }

  revalidateFeeds();
  return { successToken: crypto.randomUUID() };
}

/**
 * Create a post on `/media`: a picture, with an optional caption.
 *
 * The image is uploaded before the row is written, so an upload failure leaves nothing
 * behind. If the insert then fails, the image is removed again -- an object no post
 * points at is invisible to everyone but still costs storage forever.
 *
 * `image_url: null` is not reachable from here: the guard above refuses the row before the
 * insert is built, which is what keeps `/media` from ever showing a text-only post.
 *
 * The ban check happens *before* the upload rather than after the insert. The trigger would
 * refuse the row, but the picture would already be in the bucket with nothing pointing at
 * it -- an orphan that costs storage forever and cannot be removed by anything except a
 * storage sweep. `requireWriterId()` is what keeps that from happening.
 */
export async function buatPostMedia(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const image = readImageField(formData);
  const parsed = postMediaSchema.safeParse({
    content: formData.get("content"),
    anonymous: parseAnonymous(formData.get("anonymous")),
  });

  // The schema cannot see a file, so "there was no picture" is the one refusal this
  // action has to make itself.
  if (!hasImage(image)) return { message: EMPTY_MEDIA_MESSAGE };

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  let userId: string;
  try {
    userId = await requireWriterId();
  } catch (error) {
    if (error instanceof Error && error.message === "BANNED") return { message: BAN_WRITE_MESSAGE };
    return { message: "Sesi kamu habis. Masuk lagi ya." };
  }

  const supabase = await createClient();

  let imageUrl: string | null = null;
  if (image) {
    const uploaded = await uploadPostImage(supabase, userId, image);
    if (!uploaded.ok) return { message: uploaded.message };
    imageUrl = uploaded.url;
  }

  const { error } = await supabase.from("posts").insert({
    id: crypto.randomUUID(),
    content: parsed.data.content,
    image_url: imageUrl,
    anonymous: parsed.data.anonymous,
  });

  if (error) {
    await discardUploadedImage(supabase, imageUrl);
    return { message: pesanTulis(error, "Gagal menyimpan. Coba lagi sebentar.") };
  }

  revalidateFeeds();
  return { successToken: crypto.randomUUID() };
}

/**
 * Create a text-only anonymous post as a signed-out visitor.
 *
 * This is a completely separate write path from `buatPostTeks`: no session is read,
 * no identity is chosen, and the row lands in `guest_posts`, which has no author
 * column and no image column at all. The `anon` role holds INSERT on exactly
 * `(id, content)` and nothing else, so there is no field here that could be used
 * to write into somebody else's account.
 *
 * `public.guest_post_rate_ok()` in the INSERT policy is what actually throttles
 * abuse; it is enforced by Postgres so it holds even if this action is bypassed.
 */
export async function buatGuestPost(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = guestPostSchema.safeParse({ content: formData.get("content") });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Belum bisa dikirim.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("guest_posts").insert({
    id: crypto.randomUUID(),
    content: parsed.data.content,
  });

  if (error) {
    // The rate limit is the only INSERT policy on `guest_posts`, so a 42501 here
    // can only be the flood guard.
    if (error.code === "42501") {
      return { message: "Terlalu banyak posting dari tamu baru saja. Coba lagi nanti." };
    }
    return { message: "Gagal menyimpan. Coba lagi sebentar." };
  }

  revalidateFeeds();
  return { successToken: crypto.randomUUID() };
}

/**
 * Delete your own post.
 *
 * Not a `DELETE` from here: `authenticated` holds no DELETE grant on `posts` and the only
 * policy calls `private.is_admin()`, which is deliberate (0008). Instead the whole check
 * lives in `public.hapus_post_saya` -- a `security definer` function whose only question
 * is whether the row is the caller's, which logs the removal, and which returns the
 * image URL so nothing has to be read twice. A member forging the call gets 42501 from
 * the database, not from this file.
 *
 * The image is removed afterwards and not before: the row is the thing that decides
 * whether anything should be deleted at all, and an object whose post still exists is a
 * post that still renders. `discardUploadedImage` swallows its own failure, which is the
 * right weight for it -- the row is already gone, and the only cost of an orphan is
 * storage, not correctness.
 *
 * Both paths are revalidated, because the post is on the feed and its own page, and the
 * second one 404s once the row is gone.
 *
 * `requireUserId`, not `requireWriterId`: a ban blocks writing, and taking something down is
 * not writing. The insert trigger from 0017 does not fire on a delete either, so a frozen
 * member can still remove their own post -- which is the last thing they should have to log
 * in to be able to do.
 */
export async function hapusPost(postId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return { ok: false, message: "ID post tidak valid." };

  try {
    await requireUserId();
  } catch {
    return { ok: false, message: "Sesi kamu habis. Masuk lagi ya." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("hapus_post_saya", { p_post_id: parsed.data });

  if (error) return { ok: false, message: pesanHapus(error) };

  // The RPC returns the URL, or null for the text-only posts that never had an image.
  await discardUploadedImage(supabase, typeof data === "string" ? data : null);

  revalidateFeeds(`/post/${parsed.data}`);
  return { ok: true };
}

/**
 * Like a post.
 *
 * A guest post is not a row in `posts`, so it cannot be a row in `likes` either:
 * `likes.post_id` is a foreign key, and pointing it at a guest post raises 23503
 * every time. Guest likes therefore live in `guest_likes`, keyed the same way, and
 * `isGuest` is threaded through from the feed's own `is_guest` column.
 *
 * The caller gains nothing by lying about `isGuest`. Both tables pin `user_id` to
 * `auth.uid()` and both foreign keys reject an id that is not a real row, so the
 * worst case is a like landing on the other post -- which is a like that caller was
 * entitled to make anyway.
 *
 * A duplicate like raises 23505 and is deliberately ignored: liking twice is a
 * no-op, not an error the reader needs to see. Anything else is logged, because a
 * silently swallowed failure looks exactly like a button that does nothing.
 *
 * A ban is checked here and again by the insert trigger on `likes` / `guest_likes`. There is
 * nowhere to put a refusal -- `LikeButton` takes a `void` action and has no error slot --
 * so the ban is logged rather than shown, and the `BanBanner` in `AppShell` is what tells
 * the member why nothing happened. Logging rather than swallowing keeps the difference
 * between "server refused" and "button broken" visible in the server log.
 */
export async function sukaPost(postId: string, isGuest: boolean): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  let userId: string;
  try {
    userId = await requireWriterId();
  } catch (error) {
    if (error instanceof Error && error.message === "BANNED") {
      console.error("sukaPost ditolak, akun sedang dibekukan", { postId: parsed.data });
    }
    return;
  }

  const supabase = await createClient();
  const { error } = isGuest
    ? await supabase.from("guest_likes").insert({ user_id: userId, guest_post_id: parsed.data })
    : await supabase.from("likes").insert({ user_id: userId, post_id: parsed.data });

  if (error && error.code !== "23505") {
    console.error("sukaPost gagal", { code: error.code, message: error.message });
  }

  revalidateFeeds(`/post/${parsed.data}`);
}

/**
 * Unlike. Both columns are in the filter because neither table has a readable id and
 * a like is only removable by whoever made it -- which the RLS policy then re-checks.
 *
 * `requireUserId`, not `requireWriterId`, and the asymmetry with `sukaPost` is deliberate:
 * taking a like back is not writing, and a frozen member who can no longer add one should
 * not be left with a heart they are not allowed to remove.
 */
export async function batalSukaPost(postId: string, isGuest: boolean): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return;
  }

  const supabase = await createClient();
  const { error } = isGuest
    ? await supabase
        .from("guest_likes")
        .delete()
        .eq("guest_post_id", parsed.data)
        .eq("user_id", userId)
    : await supabase
        .from("likes")
        .delete()
        .eq("post_id", parsed.data)
        .eq("user_id", userId);

  if (error) {
    console.error("batalSukaPost gagal", { code: error.code, message: error.message });
  }

  revalidateFeeds(`/post/${parsed.data}`);
}
