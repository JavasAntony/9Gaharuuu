/**
 * Shared helpers for the scripts in this folder. Plain `fetch`, no dependencies:
 * these must run on any machine that can reach the Supabase project.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue = ""] = match;
      if (process.env[key] === undefined) {
        process.env[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    }
  }
}

export function config() {
  loadEnv();

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    !secretKey && "SUPABASE_SECRET_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    fail(`Missing environment variables: ${missing.join(", ")}. Copy .env.example to .env.local.`);
  }

  return { url, publishableKey, secretKey };
}

/** Issues a request and returns `{ status, ok, body }` with the body already parsed. */
export async function request(path, options = {}) {
  const { method = "GET", key, token, body, extraHeaders = {}, base } = options;

  const headers = { apikey: key, ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { status: response.status, ok: response.ok, body: parsed, raw: text };
}

export function describe(result) {
  if (typeof result.body === "string") return `HTTP ${result.status}: ${result.body}`;
  return `HTTP ${result.status}: ${JSON.stringify(result.body)}`;
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
