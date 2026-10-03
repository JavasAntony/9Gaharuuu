/**
 * Creates the admin and classmate accounts. There is no self-signup in v1, so
 * this is the only way an account comes into existence.
 *
 * Auth identity is a synthetic email `{username}@kelaskita.local`; the real login
 * screen asks for username + password only and builds that address server-side.
 *
 * Idempotent: re-running updates the password and role of existing accounts
 * instead of failing on a duplicate email or username.
 *
 *   npm run seed:users
 *   SEED_PASSWORD=rahasia-kelas npm run seed:users
 */
import { config, describe, fail, request } from "./_shared.mjs";

const ACCOUNTS = [
  { username: "admin", role: "admin" },
  { username: "sari", role: "member" },
  { username: "bimo", role: "member" },
  { username: "dimas", role: "member" },
];

const PASSWORD = process.env.SEED_PASSWORD ?? "kelaskita-v1";

const { url, secretKey } = config();

async function findUserByEmail(email) {
  const result = await request("/auth/v1/admin/users?per_page=1000", { key: secretKey, base: url });
  if (!result.ok) fail(`Could not list users. ${describe(result)}`);

  const users = Array.isArray(result.body?.users) ? result.body.users : [];
  return users.find((user) => user.email === email) ?? null;
}

async function upsertUser({ username, role }) {
  const email = `${username}@kelaskita.local`;

  const existing = await findUserByEmail(email);

  let userId;
  if (existing) {
    userId = existing.id;
    const updated = await request(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: secretKey,
      base: url,
      body: {
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { username },
      },
    });

    if (!updated.ok) {
      fail(`Could not update ${username}. ${describe(updated)}`);
    }
    console.log(`  updated  ${username}`);
  } else {
    const created = await request("/auth/v1/admin/users", {
      method: "POST",
      key: secretKey,
      base: url,
      body: {
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { username },
      },
    });

    if (!created.ok) fail(`Could not create ${username}. ${describe(created)}`);

    userId = created.body.id;
    console.log(`  created  ${username}`);
  }

  await ensureProfile(userId, username, role);
  return { username, role };
}

/**
 * The `on_auth_user_created` trigger creates the profile, but it only fires on
 * insert. An account created before the migration exists would have none, so
 * this repairs that case and is also what sets `role`.
 */
async function ensureProfile(userId, username, role) {
  const existing = await request(
    `/rest/v1/profiles?select=id,role&id=eq.${userId}`,
    { key: secretKey, base: url },
  );

  if (!existing.ok) fail(`Could not read the profile for ${username}. ${describe(existing)}`);

  if (Array.isArray(existing.body) && existing.body.length > 0) {
    const updated = await request(`/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      key: secretKey,
      base: url,
      body: { role, username },
    });

    if (!updated.ok) fail(`Could not update the profile for ${username}. ${describe(updated)}`);
    return;
  }

  const created = await request("/rest/v1/profiles", {
    method: "POST",
    key: secretKey,
    base: url,
    body: { id: userId, username, role },
  });

  if (!created.ok) fail(`Could not create the profile for ${username}. ${describe(created)}`);
}

const seeded = [];
for (const account of ACCOUNTS) {
  seeded.push(await upsertUser(account));
}

console.log("\nKelasKita v1 — akun siap dipakai di /masuk\n");
console.log("  username   peran");
for (const account of seeded) {
  console.log(
    `  ${account.username.padEnd(10)} ${account.role === "admin" ? "admin kelas" : "anggota"}`,
  );
}
console.log(`\n  kata sandi: ${PASSWORD}`);
console.log("  alamat login: {username}@kelaskita.local (dibentuk server, tidak diketik user)\n");
