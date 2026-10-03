import { z } from "zod";
import { MAX_COMMENT_LENGTH, MAX_POST_LENGTH, USERNAME_PATTERN } from "./constants";

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

export const postSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: "Tulis sesuatu dulu, dong." })
    .max(MAX_POST_LENGTH, {
      error: `Maksimal ${MAX_POST_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

export const commentSchema = z.object({
  postId: z.uuid({ error: "ID post tidak valid." }),
  parentCommentId: z.uuid({ error: "ID komentar tidak valid." }).nullable(),
  content: z
    .string()
    .trim()
    .min(1, { error: "Tulis balasan dulu, dong." })
    .max(MAX_COMMENT_LENGTH, {
      error: `Maksimal ${MAX_COMMENT_LENGTH} karakter.`,
    }),
  anonymous: z.boolean(),
});

export const idSchema = z.uuid({ error: "ID tidak valid." });

export type LoginInput = z.infer<typeof loginSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
