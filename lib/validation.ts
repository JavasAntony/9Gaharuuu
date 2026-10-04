import { z } from "zod";
import {
  MAX_COMMENT_LENGTH,
  MAX_GUEST_POST_LENGTH,
  MAX_POST_LENGTH,
  MAX_REPORT_DESCRIPTION,
  USERNAME_PATTERN,
} from "./constants";
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
 * `content` may be empty here, because a post can be an image and nothing else. What it
 * may not be is nothing at all -- `hasTextOrImage` in the actions is what enforces that,
 * since whether a file arrived is a `FormData` question the schema cannot see.
 *
 * The guest schemas below keep `min(1)`, and that asymmetry is deliberate rather than an
 * oversight: a guest has no upload path, so for a guest an empty body is still empty.
 */
export const postSchema = z.object({
  content: z
    .string()
    .trim()
    .max(MAX_POST_LENGTH, {
      error: `Maksimal ${MAX_POST_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

/** At least one of the two has to be present. Both absent is not a post. */
export function hasTextOrImage(content: string, image: File | null): boolean {
  return content.length > 0 || image !== null;
}

export const EMPTY_POST_MESSAGE = "Tulis sesuatu atau pilih gambar dulu, dong.";

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
 * `min(1)` stays here even though `postSchema` dropped it, because a member can post an
 * image with no text and a guest cannot post anything at all: `guest_posts` grants INSERT
 * on `(id, content)` only, so an image has nowhere to go and an empty body would be a
 * row with nothing in it.
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

export type LoginInput = z.infer<typeof loginSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type GuestPostInput = z.infer<typeof guestPostSchema>;
export type GuestCommentInput = z.infer<typeof guestCommentSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
