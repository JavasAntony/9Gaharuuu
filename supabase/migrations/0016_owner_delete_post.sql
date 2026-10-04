-- KelasKita v2: let the author take their own post down.
--
-- 0008 closed deletion to admins so that every removal would go through
-- `public.hapus_konten` and land in `moderation_logs` with the acting id. That was the
-- right call for moderation, but it left a member with no way to unsend something they
-- wrote in the first place, which is not the same problem. The affordance belongs back
-- on the post; the audit trail does not have to go anywhere.
--
-- So this adds a second door rather than reopening the first:
--
--   * `authenticated` still has no DELETE grant on `posts`, and the only delete policy
--     still calls `private.is_admin()`. A raw PostgREST DELETE still raises 42501.
--   * `public.hapus_post_saya` is `security definer`, so it can reach `posts.user_id`
--     that the caller cannot read, and it answers exactly one question: is this row
--     yours? It is a narrower capability than the grant would have been -- one function,
--     one table, one branch -- and it is revocable in one line.
--   * It writes the same `content_delete` row the admin RPC writes, so the dashboard and
--     the trail cannot tell the difference by omission.
--
-- The delete cascades the same way the admin path does: `posts_delete_comments` (0010) is
-- a `security definer` BEFORE DELETE trigger, so the comments go with the post even
-- though `authenticated` holds no DELETE on `comments`. That trigger is why the member
-- path needs no grant at all.
--
-- Guest content is untouched: `guest_posts` has no author column, so there is no "yours"
-- to check, and an admin removing it still goes through `public.hapus_konten`.
--
-- The uploaded image is not touched here. Storage objects are files, not rows, and a
-- `delete from storage.objects` inside this function would remove the record while
-- leaving the object in the bucket -- the Storage API never runs to see it. `hapusPost`
-- in `app/actions/posts.ts` gets the URL back from this function and removes it through
-- `storage.objects` over HTTP, which is the one path that deletes the file itself.

-- `content_delete` already exists; a self-delete needs its own action name so the trail
-- says who acted without relying on the viewer comparing `admin_id` against the role.
alter table public.moderation_logs drop constraint moderation_logs_action_check;

alter table public.moderation_logs
  add constraint moderation_logs_action_check
  check (
    action in (
      'report_review', 'report_resolve', 'report_dismiss',
      'content_delete', 'post_self_delete'
    )
  );

-- Returns the public URL of the post's image, or null, so the caller can remove exactly
-- the object this row owned -- read inside the same statement that decided the delete was
-- allowed, rather than in a second query that could disagree with it.
create or replace function public.hapus_post_saya(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_penulis uuid := (select auth.uid());
  v_gambar text;
begin
  if v_penulis is null then
    raise exception 'Hanya anggota kelas yang bisa menghapus posting'
      using errcode = '42501';
  end if;

  select p.image_url into v_gambar
  from public.posts p
  where p.id = p_post_id;

  -- Every member reads every post, so this branch leaks nothing; it exists so a
  -- duplicated tap says "already gone" instead of "not yours".
  if not found then
    raise exception 'Konten tidak ditemukan'
      using errcode = 'P0002';
  end if;

  if not (select private.owns_post(p_post_id)) then
    raise exception 'Hanya penulisnya yang bisa menghapus posting ini'
      using errcode = '42501';
  end if;

  delete from public.posts where id = p_post_id;

  -- `admin_id` is the column every moderation write has used for "who acted". It is
  -- nullable since 0006 precisely so a row can outlive the account; here it is the
  -- author's own id, which is the point of the row.
  insert into public.moderation_logs (admin_id, action, target_type, target_id, reason)
  values (v_penulis, 'post_self_delete', 'post', p_post_id, 'Dihapus oleh penulis');

  return v_gambar;
end;
$$;

revoke execute on function public.hapus_post_saya(uuid) from public, anon;
grant execute on function public.hapus_post_saya(uuid) to authenticated;