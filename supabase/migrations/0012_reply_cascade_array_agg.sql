-- KelasKita v2 follow-up: `array_agg` in the reply-cascade trigger.
--
-- 0011's `private.delete_comment_subtree()` asked for
--
--   delete from public.comments where parent_comment_id = any(v_frontier)
--     returning id into v_frontier;
--
-- and that is wrong in a way that only shows up sometimes. A PL/pgSQL `INTO`
-- without `STRICT` assigns the scalar when the query returns exactly one row, and an
-- array only when it returns several. So deleting a single reply set `v_frontier` to
-- a bare `uuid`, and the next pass evaluated `any(<uuid>)`, which Postgres rejected:
--
--   22P02 malformed array literal: "a2689c51-a8e6-46db-9068-d2c471b1f363"
--
-- One reply meant the next deletion worked and the one after it failed; two or more
-- worked. Either way the whole `hapus_konten` call rolled back, so deleting a post or
-- a comment that had a reply under it raised instead of succeeding.
--
-- `array_agg` makes the assignment unconditional: zero rows give NULL, which the
-- `coalesce(array_length(...), 0) = 0` exit already handles, and any number of rows
-- give an array. Nothing else about the function changes.

create or replace function private.delete_comment_subtree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_frontier uuid[];
begin
  v_frontier := array[old.id];

  loop
    delete from public.comments
      where parent_comment_id = any(v_frontier)
      returning array_agg(id) into v_frontier;

    exit when coalesce(array_length(v_frontier, 1), 0) = 0;

    delete from public.guest_comments
      where parent_comment_id = any(v_frontier)
      returning array_agg(id) into v_frontier;

    exit when coalesce(array_length(v_frontier, 1), 0) = 0;
  end loop;

  return old;
end;
$$;