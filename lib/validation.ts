import { z } from "zod";
import {
  MAX_ANNOUNCEMENT_CONTENT_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  MAX_AUDIT_REASON_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_GUEST_POST_LENGTH,
  MAX_POST_LENGTH,
  MAX_REPORT_DESCRIPTION,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
} from "./constants";
import { BAN_DURATION_VALUES } from "./bans";
import { REPORT_REASON_VALUES } from "./reports";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, {
    error: "Username hanya boleh huruf kecil, angka, titik, garis bawah, atau strip (3-24 karakter).",
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, { error: "Kata sandi wajib diisi." }),
});

/**
 * The two feeds are one rule apart, and it is decided by a column rather than by a
 * setting: a post is in the media feed exactly when `image_url` is not null, and in the
 * text feed exactly when it is. There is no `feed` column to disagree with, so the two
 * partitions cannot overlap and neither can lose a row.
 *
 * What the schemas therefore have to express is what each route will *accept*, because
 * the database cannot: `posts.image_url` is nullable and both forms are legal rows. The
 * route is the only place that knows which one it is.
 */

/** `/feed`. Words are the post. `min(1)` because there is no picture to stand in for them. */
export const postTeksSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: "Tulis sesuatu dulu, dong." })
    .max(MAX_POST_LENGTH, {
      error: `Maksimal ${MAX_POST_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

/**
 * `/media`. The picture is the post and the words are a caption on it, so `content` has
 * no `min`. Whether a file actually arrived is a `FormData` question the schema cannot
 * see, which is why the action pairs this with `hasImage`.
 */
export const postMediaSchema = z.object({
  content: z
    .string()
    .trim()
    .max(MAX_POST_LENGTH, {
      error: `Maksimal ${MAX_POST_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

/**
 * The one question each post action cannot delegate to its schema, stated once so the
 * two rules cannot be written two slightly different ways.
 */
export function hasText(content: string): boolean {
  return content.length > 0;
}

export function hasImage(image: File | null): boolean {
  return image !== null;
}

/**
 * One message per refusal, because the three failures are three different mistakes and a
 * single generic "invalid post" would leave the writer guessing which one they made.
 */
export const EMPTY_TEXT_MESSAGE = "Feed ini teks saja. Tulis sesuatu dulu, dong.";
export const EMPTY_MEDIA_MESSAGE = "Feed ini khusus gambar. Pilih satu gambar dulu, dong.";
export const IMAGE_NOT_ALLOWED_MESSAGE = "Feed ini tidak menerima gambar. Kirim ke feed media.";

/**
 * A comment is not a post. The text feed's rule is about what a *row in the feed* is,
 * and a reply is not one, so the same three shapes are legal under both feeds: words,
 * words plus a picture, or just a picture. `hasTextOrImage` below is the whole rule for
 * that, because a comment thread has nowhere else to say it.
 */
export function hasTextOrImage(content: string, image: File | null): boolean {
  return content.length > 0 || image !== null;
}

export const EMPTY_COMMENT_MESSAGE = "Tulis sesuatu atau pilih gambar dulu, dong.";

export const commentSchema = z.object({
  postId: z.uuid({ error: "ID post tidak valid." }),
  parentCommentId: z.uuid({ error: "ID komentar tidak valid." }).nullable(),
  content: z
    .string()
    .trim()
    .max(MAX_COMMENT_LENGTH, {
      error: `Maksimal ${MAX_COMMENT_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

export const idSchema = z.uuid({ error: "ID tidak valid." });

/**
 * A guest post is always anonymous and always text-only, so there is nothing to
 * configure: no identity toggle, no image field, no account to attribute it to.
 *
 * `min(1)` is not a second opinion about the text feed's rule, it is the whole rule: a
 * guest has no upload path at all. `guest_posts` grants INSERT on `(id, content)` only,
 * so "text or nothing" is enforced by the grant rather than by a rule someone can soften.
 * A guest posting to `/media` is therefore not a validation error to report but a route
 * the composer never offers, because there is nowhere to put the image.
 */
export const guestPostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: "Tulis sesuatu dulu, dong." })
    .max(MAX_GUEST_POST_LENGTH, {
      error: `Maksimal ${MAX_GUEST_POST_LENGTH} karakter.`,
    }),
});

/**
 * A guest reply, like a guest post, has nothing to configure: no identity toggle,
 * no image field, no author. `anonymous` is absent because `guest_comments` has
 * no such column -- the table stores no author information at all, so the reply
 * cannot be attributed even by the database.
 */
export const guestCommentSchema = z.object({
  postId: z.uuid({ error: "ID post tidak valid." }),
  parentCommentId: z.uuid({ error: "ID komentar tidak valid." }).nullable(),
  content: z
    .string()
    .trim()
    .min(1, { error: "Tulis balasan dulu, dong." })
    .max(MAX_COMMENT_LENGTH, {
      error: `Maksimal ${MAX_COMMENT_LENGTH} karakter.`,
    }),
});

/**
 * Exactly one target. The action turns whichever id is present into the
 * `p_post_id` / `p_comment_id` arguments; neither comes from a reporter field.
 */
export const reportSchema = z.object({
  targetKind: z.enum(["post", "comment"], { error: "Jenis laporan tidak valid." }),
  targetId: z.uuid({ error: "ID konten tidak valid." }),
  reason: z.enum(REPORT_REASON_VALUES, { error: "Pilih alasan dulu." }),
  description: z
    .string()
    .trim()
    .max(MAX_REPORT_DESCRIPTION, {
      error: `Keterangan maksimal ${MAX_REPORT_DESCRIPTION} karakter.`,
    })
    .optional(),
});

export const moderationSchema = z.object({
  reportId: z.uuid({ error: "ID laporan tidak valid." }),
  status: z.enum(["reviewing", "resolved", "dismissed"], { error: "Status tidak valid." }),
});

export const moderationDeleteSchema = z.object({
  kind: z.enum(["post", "comment", "guest_post", "guest_comment"], {
    error: "Jenis konten tidak valid.",
  }),
  targetId: z.uuid({ error: "ID konten tidak valid." }),
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Admin: accounts
// ---------------------------------------------------------------------------

/**
 * A new account, created by an admin rather than by its owner.
 *
 * There is no signup form anywhere in the app, so this is the only path a new classmate can
 * arrive by, and the password is set by the admin rather than chosen by them. That is why
 * `username` goes through the same `usernameSchema` the login screen uses: the sign-in form
 * builds `{username}@kelaskita.local` and looks the account up by that address, so a
 * username that fails this schema is an account nobody could ever sign in to.
 */
export const userCreateSchema = z.object({
  username: usernameSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, {
      error: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    })
    .max(72, { error: "Kata sandi terlalu panjang." }),
  role: z.enum(["member", "admin"], { error: "Peran tidak valid." }),
});

/**
 * Every account action that names exactly one target and needs nothing else.
 *
 * The target id arrives in a hidden input on the row, so it is as forgeable as anything else
 * a browser sends -- the reason to parse it is to reject a malformed one before it reaches
 * a query, not to trust it.
 */
export const userTargetSchema = z.object({
  targetId: z.uuid({ error: "ID akun tidak valid." }),
});

/**
 * A ban, as the form describes it: a duration preset rather than a date.
 *
 * The preset becomes `banned_until` in `app/actions/users.ts`, and null for "permanen". A
 * form that could post an arbitrary timestamp would let a mistyped year block somebody
 * until 3026, and the database's "must be in the future" check would accept it.
 */
export const banSchema = userTargetSchema.extend({
  duration: z.enum(BAN_DURATION_VALUES, { error: "Pilih lama blokir dulu." }),
  reason: z.string().trim().max(MAX_AUDIT_REASON_LENGTH, {
    error: `Alasan maksimal ${MAX_AUDIT_REASON_LENGTH} karakter.`,
  }),
});

/** Lifting a ban. The reason is for the audit trail, not for the member. */
export const unbanSchema = userTargetSchema.extend({
  reason: z
    .string()
    .trim()
    .max(MAX_AUDIT_REASON_LENGTH, {
      error: `Alasan maksimal ${MAX_AUDIT_REASON_LENGTH} karakter.`,
    })
    .optional(),
});

export const roleChangeSchema = userTargetSchema.extend({
  role: z.enum(["member", "admin"], { error: "Peran tidak valid." }),
});

// ---------------------------------------------------------------------------
// Admin: announcements
// ---------------------------------------------------------------------------

/**
 * An announcement is a title and a body, both bounded by the same lengths the table's CHECK
 * constraints use. The database is what ultimately refuses an over-long one; this exists so
 * the form can say which field is wrong.
 */
export const announcementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Judulnya belum diisi." })
    .max(MAX_ANNOUNCEMENT_TITLE_LENGTH, {
      error: `Judul maksimal ${MAX_ANNOUNCEMENT_TITLE_LENGTH} karakter.`,
    }),
  content: z
    .string()
    .trim()
    .min(1, { error: "Isinya belum diisi." })
    .max(MAX_ANNOUNCEMENT_CONTENT_LENGTH, {
      error: `Isi maksimal ${MAX_ANNOUNCEMENT_CONTENT_LENGTH} karakter.`,
    }),
});

/** Editing keeps the two text fields and adds which row, because the manager edits in place. */
export const announcementEditSchema = announcementSchema.extend({
  announcementId: z.uuid({ error: "ID pengumuman tidak valid." }),
});

export const announcementTargetSchema = z.object({
  announcementId: z.uuid({ error: "ID pengumuman tidak valid." }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PostTeksInput = z.infer<typeof postTeksSchema>;
export type PostMediaInput = z.infer<typeof postMediaSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type GuestPostInput = z.infer<typeof guestPostSchema>;
export type GuestCommentInput = z.infer<typeof guestCommentSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type BanInput = z.infer<typeof banSchema>;
