/**
 * Wipes every post, comment, like, report and log, and empties the `post-images` bucket.
 *
 * This is the half of the reset that `supabase/reset_content.sql` cannot do. Storage
 * objects are files, not rows: deleting from `storage.objects` inside a SQL transaction
 * removes the record and leaves the file sitting in the bucket, so the bucket would claim
 * to be empty and still serve every old image. Only the Storage API actually unlinks a
 * file, which is the same reason `hapusPost` in `app/actions/posts.ts` removes an image
 * over HTTP rather than from a cascade.
 *
 * Accounts are never touched. `profiles` and `auth.users` are not in the list below, so
 * every classmate can sign in again afterwards with the content gone. `announcements` is
 * not in the list either: a site-wide announcement is not content, and a reset should not
 * silently retract something the class was told.
 *
 * Dry run by default. Nothing is deleted without `--yes`.
 *
 *   npm run reset:content                 # report what would go
 *   npm run reset:content -- --yes        # do it
 *   npm run reset:content -- --yes --storage-only    # keep the rows, clear the bucket
 */
import { config, describe, fail, request } from "./_shared.mjs";

const BUCKET = "post-images";

/**
 * Rows first is not arbitrary: `likes.post_id` and `guest_likes.guest_post_id` are real
 * foreign keys, and deleting a post before its likes raises 23503. Tables with no FK to
 * content (`reports`, `moderation_logs`, `guest_comments`) are named too, because they
 * would not be reached by any cascade.
 *
 * `key` is a column every row of that table actually has. It exists because the two like
 * tables have no `id` at all -- their primary keys are `(user_id, post_id)` and
 * `(user_id, guest_post_id)` -- so a script that assumed one shape would fail on exactly the
 * two tables it most needs to clear, and would do so only after the announcement.
 */
const TABLES = [
  { table: "guest_likes", key: "user_id" },
  { table: "guest_comments", key: "id" },
  { table: "guest_posts", key: "id" },
  { table: "likes", key: "user_id" },
  { table: "comments", key: "id" },
  { table: "posts", key: "id" },
  { table: "reports", key: "id" },
  { table: "moderation_logs", key: "id" },
];

const { url, secretKey } = config();

const yes = process.argv.includes("--yes");
const storageOnly = process.argv.includes("--storage-only");
const rowsOnly = process.argv.includes("--rows-only");

// Every uuid sorts above the nil uuid, so `<key> = neq.<nil>` matches every row while still
// being a real filter: PostgREST refuses a DELETE without one.
const MATCH_ALL = (key) => `${key}=neq.00000000-0000-0000-0000-000000000000`;
const LIST_PAGE = 1000;

/**
 * Counts a table through PostgREST.
 *
 * `Range: 0-0` asks for one row and `Prefer: count=exact` asks for the total in the
 * `content-range` header, so the count does not depend on downloading the table -- which
 * matters when the answer is "several hundred thousand rows" and the point is to report it
 * before deleting it.
 */
async function countRows(table, key) {
  const result = await request(`/rest/v1/${table}?select=${key}`, {
    key: secretKey,
    base: url,
    extraHeaders: { Prefer: "count=exact", Range: "0-0" },
  });

  if (!result.ok) fail(`Could not count ${table}. ${describe(result)}`);

  // `content-range: 0-0/1234`
  const total = Number.parseInt(result.headers.get("content-range")?.split("/")[1] ?? "", 10);
  return Number.isNaN(total) ? 0 : total;
}

async function deleteRows(table, key) {
  const result = await request(`/rest/v1/${table}?${MATCH_ALL(key)}`, {
    method: "DELETE",
    key: secretKey,
    base: url,
  });

  if (!result.ok) fail(`Could not clear ${table}. ${describe(result)}`);
}

/**
 * Lists one prefix of the bucket. Directories come back as bare `{ name }` objects with no
 * `metadata`; files carry it. That difference is the only way to tell a folder from an
 * object, which is why the walk recurses.
 */
async function listPrefix(prefix) {
  const found = [];
  let offset = 0;

  for (;;) {
    const result = await request(`/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      key: secretKey,
      base: url,
      body: { prefix, limit: LIST_PAGE, offset },
    });

    if (result.status === 404 || result.status === 400) return found;
    if (!result.ok) fail(`Could not list ${BUCKET}/${prefix}. ${describe(result)}`);

    const batch = Array.isArray(result.body) ? result.body : [];
    found.push(...batch);
    if (batch.length < LIST_PAGE) return found;

    offset += batch.length;
  }
}

/**
 * The whole bucket as a flat list of paths.
 *
 * Objects live at `<userId>/<uuid>.<ext>`, so the bucket is one folder per member plus
 * anything uploaded before that layout existed, which is why the walk does not assume a
 * single level.
 */
async function collectPaths() {
  const paths = [];
  const queue = [""];

  while (queue.length > 0) {
    const prefix = queue.shift();
    for (const entry of await listPrefix(prefix)) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.metadata) paths.push(path);
      else queue.push(path);
    }
  }

  return paths;
}

async function removePaths(paths) {
  // The delete endpoint takes a batch per call; a class's whole history fits in a few.
  for (let at = 0; at < paths.length; at += LIST_PAGE) {
    const batch = paths.slice(at, at + LIST_PAGE);
    const result = await request(`/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      key: secretKey,
      base: url,
      body: { prefixes: batch },
    });

    if (!result.ok) fail(`Could not delete a batch of objects. ${describe(result)}`);
  }
}

// ---------------------------------------------------------------------------

const counts = new Map();
if (!storageOnly) {
  for (const { table, key } of TABLES) counts.set(table, await countRows(table, key));
}

const paths = await collectPaths();
const totalObjects = paths.length;

console.log("\n9Gaharuuu — rencana reset konten\n");
console.log("  Basis data");
for (const [table, count] of counts) {
  console.log(`    ${table.padEnd(18)} ${count} baris`);
}
console.log(`\n  ${BUCKET}          ${totalObjects} berkas`);
console.log("\n  Tidak disentuh: profiles, auth.users, announcements.\n");

if (!yes) {
  console.log("  Ini belum dijalankan. Tambahkan --yes untuk benar-benar menghapus.\n");
  process.exit(0);
}

if (!storageOnly) {
  // Every table is cleared, whatever the count said. The count is a report, not a gate: a
  // missing `content-range` header would read as zero, and skipping on that would leave a
  // table full of content behind a message claiming the reset finished. DELETE on an empty
  // table costs nothing.
  for (const { table, key } of TABLES) {
    await deleteRows(table, key);
    console.log(`  dihapus  ${table}`);
  }
}

if (!rowsOnly) {
  await removePaths(paths);
  console.log(`  dihapus  ${totalObjects} berkas dari ${BUCKET}`);
}

console.log("\nSelesai. Jalankan `npm run reset:content` tanpa --yes untuk memverifikasi.\n");