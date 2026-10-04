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
/** Only ever used for `hapus_konten`, which is admin-only. */
const ADMIN = "test_rls_admin";

const { url, secretKey, publishableKey } = config();

const created = [];
/**
 * The guest fixture belongs to nobody, so deleting the throwaway users cannot
 * cascade it away -- it has to be removed by id or every run leaves a row behind
 * in `guest_posts`.
 */
const guestFixtures = [];
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

/**
 * Grants the admin role with the service key, which is how `scripts/seed-users.mjs`
 * does it. `private.is_admin()` reads `profiles.role`, not a JWT claim, so this takes
 * effect on the very next query -- no re-login needed.
 */
async function promoteToAdmin(userId) {
  const result = await request(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    key: secretKey,
    base: url,
    body: { role: "admin" },
  });
  if (!result.ok) throw new Error(`Could not promote ${userId}. ${describe(result)}`);
}

async function cleanup() {
  for (const id of created) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: secretKey, base: url });
  }
}

try {
  console.log("\nSetting up throwaway users…");
  for (const username of [...USERS, ADMIN]) await removeByEmail(username);

  const idA = await createUser(USERS[0]);
  const idB = await createUser(USERS[1]);
  await createUser(ADMIN);
  await promoteToAdmin(
    (
      await request(`/auth/v1/admin/users?per_page=1000`, { key: secretKey, base: url })
    ).body.users.find((user) => user.email === `${ADMIN}@kelaskita.local`).id,
  );
  const tokenA = await signIn(USERS[0]);
  const tokenB = await signIn(USERS[1]);
  const adminToken = await signIn(ADMIN);

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

  // Posts are admin-only now: `authenticated` holds no DELETE grant on `posts`
  // and the single delete policy is `private.is_admin()`. So this is refused
  // outright rather than matching zero rows, which is the better outcome -- a
  // silent no-op would look like a successful delete.
  const deleteStrangersPost = await rest(`posts?id=eq.${anonPostA}`, {
    method: "DELETE",
    token: tokenB,
  });
  check(
    "test_b: DELETE on posts is denied",
    isDenied(deleteStrangersPost),
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

  console.log("\n4. A student can comment and like, but cannot delete anything");

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

  // Guest likes live in their own table because `likes.post_id` references
  // `posts (id)` and a guest post is not a row there. Liking one used to fail with
  // 23503 every time, so the feed's guest rows are checked here for real: the count
  // has to move, and the liker has to be the only one who sees their own like.
  console.log("\n4b. A student can like a guest post");

  const guestForLike = crypto.randomUUID();
  const mkGuestForLike = await rest("guest_posts", {
    method: "POST",
    body: { id: guestForLike, content: "postingan tamu untuk di-suka" },
  });
  guestFixtures.push(guestForLike);
  check("signed out: the guest post is created", mkGuestForLike.ok, describe(mkGuestForLike));

  const likeGuest = await rest("guest_likes", {
    method: "POST",
    token: tokenA,
    body: { user_id: idA, guest_post_id: guestForLike },
  });
  check("test_a: liking a guest post works", likeGuest.ok, describe(likeGuest));

  const likeGuestAgain = await rest("guest_likes", {
    method: "POST",
    token: tokenA,
    body: { user_id: idA, guest_post_id: guestForLike },
  });
  check(
    "a duplicate guest like is rejected rather than double counted",
    !likeGuestAgain.ok,
    describe(likeGuestAgain),
  );

  const guestRowForA = await rest(`post_feed?id=eq.${guestForLike}&select=like_count,liked_by_me`, {
    token: tokenA,
  });
  check("test_a: the feed counts the guest like once", guestRowForA.body?.[0]?.like_count === 1, describe(guestRowForA));
  check(
    "test_a: liked_by_me is true for the liker",
    guestRowForA.body?.[0]?.liked_by_me === true,
    describe(guestRowForA),
  );

  const guestRowForB = await rest(`post_feed?id=eq.${guestForLike}&select=like_count,liked_by_me`, {
    token: tokenB,
  });
  check(
    "test_b: sees the count but not the liker's own like",
    guestRowForB.body?.[0]?.like_count === 1 && guestRowForB.body?.[0]?.liked_by_me === false,
    describe(guestRowForB),
  );

  const guestLikeForgery = await rest("guest_likes", {
    method: "POST",
    token: tokenB,
    body: { user_id: idA, guest_post_id: guestForLike },
  });
  check("a guest like cannot be attributed to somebody else", !guestLikeForgery.ok, describe(guestLikeForgery));

  const guestLikeAnonymous = await rest("guest_likes", {
    method: "POST",
    body: { guest_post_id: guestForLike },
  });
  check("signed out: liking is refused", !guestLikeAnonymous.ok, describe(guestLikeAnonymous));

  // The grant and the policy are both scoped to the caller's own rows, so this is a
  // read that succeeds and returns nothing -- not a denial. Asserting the effect is
  // the only way to show test_b cannot enumerate test_a's likes.
  const guestLikesForA = await rest(`guest_likes?guest_post_id=eq.${guestForLike}&select=user_id`, {
    token: tokenA,
  });
  check(
    "test_a: reads its own guest like",
    guestLikesForA.body?.length === 1 && guestLikesForA.body[0]?.user_id === idA,
    describe(guestLikesForA),
  );

  const guestLikesForB = await rest(`guest_likes?guest_post_id=eq.${guestForLike}&select=user_id`, {
    token: tokenB,
  });
  check(
    "test_b: cannot enumerate test_a's guest likes",
    guestLikesForB.ok && Array.isArray(guestLikesForB.body) && guestLikesForB.body.length === 0,
    describe(guestLikesForB),
  );

  const unlikeGuest = await rest(
    `guest_likes?guest_post_id=eq.${guestForLike}&user_id=eq.${idA}`,
    { method: "DELETE", token: tokenA },
  );
  check("test_a: unliking a guest post works", unlikeGuest.ok, describe(unlikeGuest));
  check(
    "the guest like is gone from the feed",
    (await rest(`post_feed?id=eq.${guestForLike}&select=like_count`, { token: tokenA })).body?.[0]
      ?.like_count === 0,
    "the count did not fall",
  );

  // A guest post used to be uncommentable, because both comment tables carried
  // `post_id references posts (id)` and a guest post is not a row there. The UI
  // explained that constraint as if it were a rule. Migration 0010 replaced the
  // foreign keys with triggers that accept a post from either table, so all four
  // combinations have to work now -- including the reply directions, which is where
  // leaving `comments.parent_comment_id` behind as a foreign key showed up.
  console.log("\n4c. Anyone can comment on anything");

  const guestThreadPost = crypto.randomUUID();
  const mkGuestThreadPost = await rest("guest_posts", {
    method: "POST",
    body: { id: guestThreadPost, content: "posting tamu yang dikomentari" },
  });
  guestFixtures.push(guestThreadPost);
  check("signed out: the guest post is created", mkGuestThreadPost.ok, describe(mkGuestThreadPost));

  const onGuestPost = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: guestThreadPost,
      content: "komentar anggota di posting tamu",
      anonymous: false,
      parent_comment_id: null,
    },
  });
  check("test_a: a member can comment on a guest post", onGuestPost.ok, describe(onGuestPost));

  const guestReplyParent = crypto.randomUUID();
  const guestOnGuestPost = await rest("guest_comments", {
    method: "POST",
    body: {
      id: guestReplyParent,
      post_id: guestThreadPost,
      content: "balasan tamu di posting tamu",
      parent_comment_id: null,
    },
  });
  check("signed out: a guest can reply on a guest post", guestOnGuestPost.ok, describe(guestOnGuestPost));

  const guestReplyId = crypto.randomUUID();
  const guestReplyToGuest = await rest("guest_comments", {
    method: "POST",
    body: {
      id: guestReplyId,
      post_id: guestThreadPost,
      content: "balasan tamu membalas balasan tamu",
      parent_comment_id: guestReplyParent,
    },
  });
  check("signed out: a guest can reply to their own reply", guestReplyToGuest.ok, describe(guestReplyToGuest));

  const memberOnGuestReply = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: guestThreadPost,
      content: "anggota membalas balasan tamu",
      anonymous: false,
      parent_comment_id: guestReplyParent,
    },
  });
  check(
    "test_a: a member can reply to a guest reply",
    memberOnGuestReply.ok,
    describe(memberOnGuestReply),
  );

  const guestThread = await rest(`comment_thread?post_id=eq.${guestThreadPost}&select=id,author_name,is_guest`);
  check("the guest thread returns all four rows", guestThread.body?.length === 4, describe(guestThread));
  check(
    "a member's comment is named and a guest's is not",
    guestThread.body?.some((row) => row.author_name === "test_a" && row.is_guest === false) &&
      guestThread.body?.filter((row) => row.is_guest).every((row) => row.author_name === "Anonim"),
    describe(guestThread),
  );
  check(
    "the feed counts the comments on a guest post",
    (await rest(`post_feed?id=eq.${guestThreadPost}&select=comment_count`, { token: tokenA })).body?.[0]
      ?.comment_count === 4,
    "count is wrong",
  );

  const ghostThread = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: crypto.randomUUID(),
      content: "komentar tanpa posting",
      anonymous: false,
      parent_comment_id: null,
    },
  });
  check(
    "a comment on a post that does not exist is still rejected",
    ghostThread.body?.code === "23503",
    describe(ghostThread),
  );

  const memberPostId = crypto.randomUUID();
  await rest("posts", {
    method: "POST",
    token: tokenA,
    body: { id: memberPostId, content: "posting anggota untuk uji balasan", anonymous: false },
  });

  const crossThread = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: memberPostId,
      content: "balasan ke komentar di posting lain",
      anonymous: false,
      parent_comment_id: guestReplyParent,
    },
  });
  check(
    "a reply to a comment on another post is still rejected",
    crossThread.body?.code === "23514",
    describe(crossThread),
  );

  // The cascades the foreign keys used to provide are now triggers, and a trigger
  // that throws looks exactly like a delete that silently failed. Deleting a
  // post that has a comment with a reply under it is the case that catches it.
  const subtreePostId = crypto.randomUUID();
  await rest("posts", {
    method: "POST",
    token: tokenA,
    body: { id: subtreePostId, content: "posting dengan pohon komentar", anonymous: false },
  });
  const rootCommentId = crypto.randomUUID();
  await rest("comments", {
    method: "POST",
    token: tokenA,
    body: { id: rootCommentId, post_id: subtreePostId, content: "akar", anonymous: false, parent_comment_id: null },
  });
  await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: subtreePostId,
      content: "anak",
      anonymous: false,
      parent_comment_id: rootCommentId,
    },
  });
  await rest("guest_comments", {
    method: "POST",
    body: { id: crypto.randomUUID(), post_id: subtreePostId, content: "cucu tamu", parent_comment_id: rootCommentId },
  });

  const deleteTreePost = await rest("rpc/hapus_konten", {
    method: "POST",
    token: adminToken,
    body: { p_kind: "post", p_id: subtreePostId, p_reason: "test_rls" },
  });
  check("an admin deletes the post", deleteTreePost.ok, describe(deleteTreePost));
  check(
    "the whole comment tree went with it",
    (await countRows(`comment_thread?post_id=eq.${subtreePostId}`, tokenA)) === 0,
    "a comment outlived the post",
  );

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

  // Not even the author may delete. `posts` and `comments` grant DELETE to nobody,
  // and the two paths that do delete -- the RLS policy and `public.hapus_konten` --
  // both resolve through `private.is_admin()`. Removal is an admin action, so the
  // owner is left asking an admin rather than quietly removing the evidence.
  const deleteOwnComment = await rest(`comments?id=eq.${commentId}`, {
    method: "DELETE",
    token: tokenA,
  });
  check(
    "test_a: deleting their own comment is denied",
    isDenied(deleteOwnComment),
    describe(deleteOwnComment),
  );
  check(
    "test_a's comment survives their own delete attempt",
    (await countRows(`comment_thread?id=eq.${commentId}`, tokenA)) === 1,
    "the comment is gone",
  );

  const deleteOwnPost = await rest(`posts?id=eq.${namedPostA}`, {
    method: "DELETE",
    token: tokenA,
  });
  check("test_a: deleting their own post is denied", isDenied(deleteOwnPost), describe(deleteOwnPost));
  check(
    "test_a's post survives their own delete attempt",
    (await countRows(`post_feed?id=eq.${namedPostA}`, tokenA)) === 1,
    "the post is gone",
  );

  // The moderation RPC is the only route to a deletion, so it has to refuse a
  // student too -- otherwise the grants above would be theatre.
  for (const [label, body] of [
    ["a post", { p_kind: "post", p_id: namedPostA, p_reason: "not mine to remove" }],
    ["a comment", { p_kind: "comment", p_id: commentId, p_reason: "not mine to remove" }],
  ]) {
    const rpc = await rest("rpc/hapus_konten", { method: "POST", token: tokenA, body });
    check(
      `test_a: the moderation RPC refuses to delete ${label}`,
      isDenied(rpc),
      describe(rpc),
    );
  }

  check(
    "the refused RPC deleted nothing",
    (await countRows(`post_feed?id=eq.${namedPostA}`, tokenA)) === 1 &&
      (await countRows(`comment_thread?id=eq.${commentId}`, tokenA)) === 1,
    "content is missing after a refused RPC",
  );

  console.log("\n5. Signed out: the feed is public, everything behind it is not");

  // v2 opened the class feed to anybody, so this is the one surface a signed-out
  // visitor gets. What must still hold is that it exposes no author id and still
  // anonymises an anonymous post: the feed being public is a product decision,
  // not a licence to unmask anybody.
  const anonFeed = await rest("post_feed?select=*", {});
  const anonFeedRows = Array.isArray(anonFeed.body) ? anonFeed.body : [];
  check(
    "signed out: post_feed returns rows",
    anonFeed.ok && anonFeedRows.some((row) => row.id === anonPostA),
    describe(anonFeed),
  );
  check(
    "signed out: an anonymous post still reads as Anonim",
    anonFeedRows.find((row) => row.id === anonPostA)?.author_name === "Anonim",
    describe(anonFeed),
  );
  check(
    "signed out: the feed exposes no author id",
    anonFeedRows.every((row) => !("user_id" in row)),
    describe(anonFeed),
  );

  // Everything that is not a public read surface stays shut.
  for (const [label, path] of [
    ["posts", "posts?select=id"],
    ["comments", "comments?select=id"],
    ["guest_posts", "guest_posts?select=id"],
    ["guest_comments", "guest_comments?select=id"],
    ["reports", "reports?select=id"],
    ["moderation_logs", "moderation_logs?select=id"],
    ["admin_reports", "admin_reports?select=id"],
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

  // A signed-out visitor can post, and only text: `guest_posts` grants INSERT on
  // `(id, content)` and nothing else, so an author column is not even nameable.
  const guestPostId = crypto.randomUUID();
  const guestPost = await rest("guest_posts", {
    method: "POST",
    body: { id: guestPostId, content: "postingan tamu dari test_rls" },
  });
  check("signed out: posting as a guest works", guestPost.ok, describe(guestPost));
  guestFixtures.push(guestPostId);

  const guestRead = await rest(`guest_posts?id=eq.${guestPostId}`, {});
  check("signed out: a guest post cannot be read back", !guestRead.ok, describe(guestRead));

  const guestForgery = await rest("guest_posts", {
    method: "POST",
    body: { id: crypto.randomUUID(), content: "meniru", anonymous: false },
  });
  check(
    "signed out: a guest post cannot be given an anonymity flag",
    !guestForgery.ok,
    describe(guestForgery),
  );

  // Guest content is reportable like anything else, which is what keeps an
  // anonymous post from being the one thing in the class nobody can hold to
  // account. Reports need a reporter, so this is a member action.
  const memberReportsGuest = await rest("rpc/buat_laporan", {
    method: "POST",
    token: tokenA,
    body: {
      p_post_id: guestPostId,
      p_comment_id: null,
      p_reason: "spam",
      p_description: "dari test_rls",
    },
  });
  check("a student can report a guest post", memberReportsGuest.ok, describe(memberReportsGuest));

  const guestReportsContent = await rest("rpc/buat_laporan", {
    method: "POST",
    body: {
      p_post_id: namedPostA,
      p_comment_id: null,
      p_reason: "spam",
      p_description: null,
    },
  });
  check("signed out: reporting is refused", !guestReportsContent.ok, describe(guestReportsContent));

  // The guest fixture is anonymous by construction, so only the admin view may
  // read it and a student gets zero rows from that view.
  const studentQueue = await rest("admin_reports?post_id=eq.${guestPostId}", { token: tokenA });
  check(
    "signed in as a student: the admin queue exposes no rows",
    !(studentQueue.ok && Array.isArray(studentQueue.body) && studentQueue.body.length > 0),
    describe(studentQueue),
  );

  console.log("\n6. Bans and announcements: the admin surface");

  // A ban is two columns and one expression, and these assert the expression rather
  // than the columns: a ban whose end date has passed is not a ban, and a trigger
  // that forgets the date would keep blocking a member forever.
  const guestPostIdForBan = crypto.randomUUID();
  const guestPostForBan = await rest("guest_posts", {
    method: "POST",
    body: { id: guestPostIdForBan, content: "post tamu untuk pengujian blokir" },
  });
  guestFixtures.push(guestPostIdForBan);
  check("signed out: the ban fixture is created", guestPostForBan.ok, describe(guestPostForBan));

  // test_a is a plain member here; test_rls_admin is the admin.
  const adminId = (
    await request("/auth/v1/admin/users?per_page=1000", { key: secretKey, base: url })
  ).body.users.find((user) => user.email === `${ADMIN}@kelaskita.local`).id;

  const memberBan = await rest("rpc/blokir_akun", {
    method: "POST",
    token: tokenA,
    body: { p_user_id: idB, p_sampai: null, p_alasan: "menolak" },
  });
  check("a student cannot ban anybody (42501)", memberBan.body?.code === "42501", describe(memberBan));

  const studentPrecheck = await rest("rpc/periksa_admin", { method: "POST", token: tokenA, body: {} });
  check("a student is refused by periksa_admin (42501)", studentPrecheck.body?.code === "42501", describe(studentPrecheck));

  const memberProfiles = await rest("admin_profiles?select=id,username", { token: tokenA });
  check(
    "a student sees no accounts in admin_profiles",
    memberProfiles.ok && Array.isArray(memberProfiles.body) && memberProfiles.body.length === 0,
    describe(memberProfiles),
  );

  const adminProfiles = await rest(
    "admin_profiles?select=id,username,role,is_banned,banned_until,ban_reason,banned_now",
    { token: adminToken },
  );
  check(
    "an admin sees the accounts with their ban state",
    adminProfiles.ok && Array.isArray(adminProfiles.body) && adminProfiles.body.length > 0,
    describe(adminProfiles),
  );
  check(
    "banned_now is false before anybody is banned",
    adminProfiles.ok && adminProfiles.body.every((profile) => profile.banned_now === false),
    describe(adminProfiles),
  );

  const ban = await rest("rpc/blokir_akun", {
    method: "POST",
    token: adminToken,
    body: {
      p_user_id: idA,
      p_sampai: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      p_alasan: "mencobak",
    },
  });
  check("an admin can ban a member", ban.ok, describe(ban));

  // The four member-owned write tables, all refused by the trigger. `guest_posts` is
  // deliberately not among them: it has no author, so a ban has nothing to attach to.
  const bannedPost = await rest("posts", {
    method: "POST",
    token: tokenA,
    body: { id: crypto.randomUUID(), content: "menanggal setelah dibekukan", anonymous: false },
  });
  check("a banned member cannot post (42501)", bannedPost.body?.code === "42501", describe(bannedPost));

  const bannedComment = await rest("comments", {
    method: "POST",
    token: tokenA,
    body: {
      id: crypto.randomUUID(),
      post_id: guestPostIdForBan,
      parent_comment_id: null,
      content: "balas",
      anonymous: false,
    },
  });
  check("a banned member cannot comment (42501)", bannedComment.body?.code === "42501", describe(bannedComment));

  const bannedLike = await rest("likes", {
    method: "POST",
    token: tokenA,
    body: { user_id: idA, post_id: namedPostA },
  });
  check("a banned member cannot like (42501)", bannedLike.body?.code === "42501", describe(bannedLike));

  const bannedGuestLike = await rest("guest_likes", {
    method: "POST",
    token: tokenA,
    body: { user_id: idA, guest_post_id: guestPostIdForBan },
  });
  check("a banned member cannot guest-like (42501)", bannedGuestLike.body?.code === "42501", describe(bannedGuestLike));

  const bannedRead = await rest("post_feed?select=id&limit=1", { token: tokenA });
  check("a banned member can still read the feed", bannedRead.ok, describe(bannedRead));

  const ownBan = await rest("rpc/blokir_akun", {
    method: "POST",
    token: adminToken,
    body: { p_user_id: adminId, p_sampai: null, p_alasan: "mencobak" },
  });
  check("an admin cannot ban themselves (P0003)", ownBan.body?.code === "P0003", describe(ownBan));

  const unban = await rest("rpc/buka_blokir_akun", {
    method: "POST",
    token: adminToken,
    body: { p_user_id: idA, p_alasan: "sudah minta maaf" },
  });
  check("an admin can lift a ban", unban.ok, describe(unban));

  const postAfterUnban = await rest("posts", {
    method: "POST",
    token: tokenA,
    body: { id: crypto.randomUUID(), content: "setelah blokir dibuka", anonymous: false },
  });
  check("the member can post again", postAfterUnban.ok, describe(postAfterUnban));

  // Announcements are readable without an account, because the feed is.
  const studentAnnouncement = await rest("rpc/buat_pengumuman", {
    method: "POST",
    token: tokenA,
    body: { p_judul: "dari siswa", p_isi: "tidak seharusnya" },
  });
  check(
    "a student cannot publish an announcement (42501)",
    studentAnnouncement.body?.code === "42501",
    describe(studentAnnouncement),
  );

  const made = await rest("rpc/buat_pengumuman", {
    method: "POST",
    token: adminToken,
    body: { p_judul: "Jadwal ulangan", p_isi: "Selasa depan." },
  });
  check("an admin can publish an announcement", made.ok, describe(made));
  const announcementId = made.body;

  const publicList = await rest("active_announcements?select=id,title,content,created_at");
  check(
    "the running announcement is readable while signed out",
    publicList.ok && publicList.body.some((item) => item.id === announcementId),
    describe(publicList),
  );
  check(
    "the public view exposes neither author nor is_active",
    publicList.ok && publicList.body.every((item) => !("author_id" in item) && !("is_active" in item)),
    describe(publicList),
  );

  const studentManager = await rest("admin_announcements?select=id", { token: tokenA });
  check(
    "a student sees no announcements in the manager view",
    studentManager.ok && Array.isArray(studentManager.body) && studentManager.body.length === 0,
    describe(studentManager),
  );

  const archived = await rest("rpc/toggle_pengumuman", {
    method: "POST",
    token: adminToken,
    body: { p_id: announcementId, p_aktif: false },
  });
  check("an admin can archive it", archived.ok, describe(archived));

  const afterArchive = await rest("active_announcements?select=id");
  check(
    "an archived announcement leaves the public view",
    afterArchive.ok && !afterArchive.body.some((item) => item.id === announcementId),
    describe(afterArchive),
  );

  const removed = await rest("rpc/hapus_pengumuman", {
    method: "POST",
    token: adminToken,
    body: { p_id: announcementId },
  });
  check("an admin can delete it", removed.ok, describe(removed));

  const trail = await rest("admin_moderation_logs?select=action,target_type", { token: adminToken });
  const trailActions = trail.ok ? trail.body.map((row) => row.action) : [];
  check("the trail recorded the ban", trailActions.includes("user_ban"), JSON.stringify(trailActions));
  check("the trail recorded the unban", trailActions.includes("user_unban"), JSON.stringify(trailActions));
  check("the trail recorded the announcement", trailActions.includes("announcement_create"), JSON.stringify(trailActions));
  check("the trail recorded the archive", trailActions.includes("announcement_archive"), JSON.stringify(trailActions));
  check("the trail recorded the deletion", trailActions.includes("announcement_delete"), JSON.stringify(trailActions));

  console.log(`\n✓ ${passed} assertions passed.\n`);
} catch (error) {
  // `process.exitCode` rather than `process.exit`, so the `finally` below still
  // removes the throwaway users and the script stays repeatable after a failure.
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  // Guest fixtures first: a report on one points at test_a, so removing the users
  // drops the report but not the content it pointed at.
  for (const id of guestFixtures) {
    await request(`/rest/v1/guest_posts?id=eq.${id}`, {
      method: "DELETE",
      key: secretKey,
      base: url,
    });
  }
  if (created.length > 0) {
    await cleanup();
    console.log("Cleaned up the throwaway users (cascade removed their content).");
  }
  if (guestFixtures.length > 0) console.log("Cleaned up the guest post fixture.");
}
