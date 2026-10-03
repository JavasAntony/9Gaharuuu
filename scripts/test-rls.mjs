/**
 * Proves the anonymity guarantee over HTTP, as a real signed-in classmate.
 *
 *   npm run test:rls
 *
 * Creates two throwaway users, exercises every allow/deny path through PostgREST
 * and the Auth API, then deletes both users (which cascades to all their posts,
 * comments and likes), so the script is repeatable. Any user left behind by an
 * earlier crashed run is removed first.
 *
 * Exits non-zero on the first failure and prints the raw response body.
 */
import { config, describe, request } from "./_shared.mjs";

const PASSWORD = "rls-test-password";
const USERS = ["test_a", "test_b"];

const { url, secretKey, publishableKey } = config();

const created = [];
let passed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
    return;
  }
  throw new Error(`${label}\n    ${detail ?? ""}`);
}

function isDenied(result) {
  return result.status === 401 || result.status === 403 || result.body?.code === "42501";
}

/** Removes any user with this email, so a crashed previous run cannot block this one. */
async function removeByEmail(username) {
  const listed = await request("/auth/v1/admin/users?per_page=1000", {
    key: secretKey,
    base: url,
  });

  if (!listed.ok) throw new Error(`Could not list users. ${describe(listed)}`);

  const users = Array.isArray(listed.body?.users) ? listed.body.users : [];
  const existing = users.find((user) => user.email === `${username}@kelaskita.local`);
  if (!existing) return;

  const removed = await request(`/auth/v1/admin/users/${existing.id}`, {
    method: "DELETE",
    key: secretKey,
    base: url,
  });

  if (!removed.ok) throw new Error(`Could not remove stale user ${username}. ${describe(removed)}`);
  console.log(`  removed a leftover ${username} from an earlier run`);
}

async function createUser(username) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: secretKey,
    base: url,
    body: {
      email: `${username}@kelaskita.local`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username },
    },
  });

  if (!result.ok) throw new Error(`Could not create ${username}. ${describe(result)}`);
  created.push(result.body.id);
  return result.body.id;
}

async function signIn(username) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: publishableKey,
    base: url,
    body: { email: `${username}@kelaskita.local`, password: PASSWORD },
  });

  if (!result.ok) throw new Error(`Could not sign in as ${username}. ${describe(result)}`);
  return result.body.access_token;
}

async function rest(path, { method = "GET", token, body } = {}) {
  return request(`/rest/v1/${path}`, {
    method,
    key: publishableKey,
    token,
    base: url,
    body,
  });
}

/**
 * Row counts are asserted by re-reading, never with
 * `Prefer: return=representation`: that makes PostgREST emit `RETURNING *`,
 * which column-level grants forbid, so the request fails with 403 for a reason
 * that has nothing to do with who was allowed to touch the row.
 *
 * `column` matters: `likes` has no `id`, and PostgREST rejects a request naming
 * a column the caller cannot read.
 */
async function countRows(path, token, column = "id") {
  const result = await rest(`${path}&select=${column}`, { token });
  if (!result.ok) throw new Error(`Could not count rows for ${path}. ${describe(result)}`);
  return Array.isArray(result.body) ? result.body.length : null;
}

async function createPost(token, content, anonymous) {
  const id = crypto.randomUUID();
  const result = await rest("posts", {
    method: "POST",
    token,
    body: { id, content, anonymous },
  });

  if (!result.ok) throw new Error(`Could not create a post as the test user. ${describe(result)}`);
  return id;
}

async function cleanup() {
  for (const id of created) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: secretKey, base: url });
  }
}

try {
  console.log("\nSetting up two throwaway users…");
  for (const username of USERS) await removeByEmail(username);

  const idA = await createUser(USERS[0]);
  const idB = await createUser(USERS[1]);
  const tokenA = await signIn(USERS[0]);
  const tokenB = await signIn(USERS[1]);

  const namedPostA = await createPost(tokenA, "post bernama dari test_a", false);
  const anonPostA = await createPost(tokenA, "post anonim dari test_a", true);

  console.log("\n1. The anonymity guarantee: no client can read an author column");

  const postsUserId = await rest("posts?select=user_id", { token: tokenB });
  check(
    "test_b: SELECT user_id from posts is denied",
    isDenied(postsUserId),
    describe(postsUserId),
  );

  const commentsUserId = await rest("comments?select=user_id", { token: tokenB });
  check(
    "test_b: SELECT user_id from comments is denied",
    isDenied(commentsUserId),
    describe(commentsUserId),
  );

  const profilesSelect = await rest("profiles?select=username", { token: tokenB });
  check(
    "test_b: SELECT from profiles is denied",
    isDenied(profilesSelect),
    describe(profilesSelect),
  );

  console.log("\n2. The definer views return rows and anonymise anonymous authors");

  const feed = await rest("post_feed?select=id,author_name,is_mine&order=created_at.desc", {
    token: tokenB,
  });
  check("test_b: post_feed returns rows", feed.ok && Array.isArray(feed.body), describe(feed));

  const feedRows = Array.isArray(feed.body) ? feed.body : [];
  const namedRow = feedRows.find((row) => row.id === namedPostA);
  const anonRow = feedRows.find((row) => row.id === anonPostA);

  check(
    "test_a's named post shows the username",
    namedRow?.author_name === USERS[0],
    `expected ${USERS[0]}, got ${JSON.stringify(namedRow)}`,
  );
  check(
    "test_a's anonymous post shows Anonim",
    anonRow?.author_name === "Anonim",
    `expected Anonim, got ${JSON.stringify(anonRow)}`,
  );
  check(
    "test_b does not see test_a's posts as their own",
    namedRow?.is_mine === false && anonRow?.is_mine === false,
    describe(feed),
  );

  console.log("\n3. A student cannot forge authorship or touch another student's rows");

  const forgePost = await rest("posts", {
    method: "POST",
    token: tokenB,
    body: { id: crypto.randomUUID(), user_id: idA, content: "meniru test_a", anonymous: false },
  });
  check(
    "test_b: INSERT with user_id set is denied",
    isDenied(forgePost),
    describe(forgePost),
  );

  const forgeLike = await rest("likes", {
    method: "POST",
    token: tokenB,
    body: { user_id: idB, post_id: namedPostA },
  });
  check("test_b: liking a post works", forgeLike.ok, describe(forgeLike));

  const updatePost = await rest(`posts?id=eq.${namedPostA}`, {
    method: "PATCH",
    token: tokenB,
    body: { content: "diubah" },
  });
  check("test_b: UPDATE on posts is denied", isDenied(updatePost), describe(updatePost));

  const deleteStrangersPost = await rest(`posts?id=eq.${anonPostA}`, {
    method: "DELETE",
    token: tokenB,
  });
  check(
    "test_b: the delete request itself is accepted",
    deleteStrangersPost.ok,
    describe(deleteStrangersPost),
  );
  check(
    "test_a's anonymous post survives test_b's delete attempt",
    (await countRows(`post_feed?id=eq.${anonPostA}`, tokenB)) === 1,
    "the post is gone",
  );

  const deleteStrangersLike = await rest(`likes?post_id=eq.${namedPostA}&user_id=eq.${idB}`, {
    method: "DELETE",
    token: tokenA,
  });
  check(
    "test_a: deleting test_b's like is accepted",
    deleteStrangersLike.ok,
    describe(deleteStrangersLike),
  );
  check(
    "test_b's like survives test_a's delete attempt",
    (await countRows(`likes?post_id=eq.${namedPostA}&user_id=eq.${idB}`, tokenB, "user_id")) === 1,
    "the like is gone",
  );

  console.log("\n4. A student can manage their own rows");

  const likeAgain = await rest("likes", {
    method: "POST",
    token: tokenB,
    body: { user_id: idB, post_id: namedPostA },
  });
  check("a duplicate like is rejected rather than double counted", !likeAgain.ok, describe(likeAgain));

  const unlike = await rest(`likes?post_id=eq.${namedPostA}&user_id=eq.${idB}`, {
    method: "DELETE",
    token: tokenB,
  });
  check("test_b: unliking works", unlike.ok, describe(unlike));

  const commentId = crypto.randomUUID();
  const comment = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: commentId,
      post_id: namedPostA,
      content: "komentar test_a",
      anonymous: false,
      parent_comment_id: null,
    },
  });
  check("test_a: commenting on their own post works", comment.ok, describe(comment));

  const crossPostReply = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: anonPostA,
      content: "balasan ke post lain",
      anonymous: false,
      parent_comment_id: commentId,
    },
  });
  check(
    "a reply to a comment on another post is rejected",
    !crossPostReply.ok,
    describe(crossPostReply),
  );

  const deleteStrangersComment = await rest(`comments?id=eq.${commentId}`, {
    method: "DELETE",
    token: tokenB,
  });
  check(
    "test_b: deleting test_a's comment is accepted",
    deleteStrangersComment.ok,
    describe(deleteStrangersComment),
  );
  check(
    "test_a's comment survives test_b's delete attempt",
    (await countRows(`comment_thread?id=eq.${commentId}`, tokenB)) === 1,
    "the comment is gone",
  );

  const deleteOwnComment = await rest(`comments?id=eq.${commentId}`, {
    method: "DELETE",
    token: tokenA,
  });
  check("test_a: deleting their own comment works", deleteOwnComment.ok, describe(deleteOwnComment));
  check(
    "test_a's comment is really gone",
    (await countRows(`comment_thread?id=eq.${commentId}`, tokenA)) === 0,
    "the comment survived",
  );

  const deleteOwnPost = await rest(`posts?id=eq.${namedPostA}`, {
    method: "DELETE",
    token: tokenA,
  });
  check("test_a: deleting their own post works", deleteOwnPost.ok, describe(deleteOwnPost));
  check(
    "test_a's post is really gone",
    (await countRows(`post_feed?id=eq.${namedPostA}`, tokenA)) === 0,
    "the post survived",
  );

  console.log("\n5. Signed out requests read nothing");

  for (const [label, path] of [
    ["post_feed", "post_feed?select=id"],
    ["posts", "posts?select=id"],
  ]) {
    const result = await rest(path, {});
    const exposed = result.ok && Array.isArray(result.body) && result.body.length > 0;
    check(`signed out: ${label} exposes no rows`, !exposed, describe(result));
  }

  const meSignedOut = await rest("me?select=id", {});
  check(
    "signed out: the me view exposes no rows",
    !(meSignedOut.ok && Array.isArray(meSignedOut.body) && meSignedOut.body.length > 0),
    describe(meSignedOut),
  );

  console.log(`\n✓ ${passed} assertions passed.\n`);
} catch (error) {
  // `process.exitCode` rather than `process.exit`, so the `finally` below still
  // removes the throwaway users and the script stays repeatable after a failure.
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (created.length > 0) {
    await cleanup();
    console.log("Cleaned up the throwaway users (cascade removed their content).");
  }
}
