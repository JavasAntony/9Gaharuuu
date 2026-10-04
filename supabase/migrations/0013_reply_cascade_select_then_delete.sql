-- KelasKita v2 follow-up: collect the ids before deleting them.
--
-- 0012 tried `returning array_agg(id) into v_frontier`, which PostgreSQL rejects
-- outright:
--
--   42803 aggregate functions are not allowed in RETURNING
--
-- Aggregates cannot appear in RETURNING at all, so the ids have to be gathered by a
-- SELECT and the deletes issued against that array. Same function, same behaviour,
-- one statement per table per round.
--
-- The shape is deliberately boring: each round finds the children of the current
-- frontier, deletes them, and becomes the frontier. Nothing overlaps, because
-- `old.id` -- the row the calling statement is already deleting -- is never a target
-- and every round only ever names rows one level further in.
--
-- Children are gathered from both tables in one query because a subtree is not
-- confined to one of them any more: a guest reply can be answered by a member, and
-- that answer can be answered by a guest.

create or replace function private.delete_comment_subtree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_frontier uuid[] := array[old.id];
  v_next uuid[];
begin
  loop
    select coalesce(array_agg(child.id), '{}'::uuid[])
      into v_next
      from (
        select c.id
        from public.comments c
        where c.parent_comment_id = any(v_frontier)
        union all
        select gc.id
        from public.guest_comments gc
        where gc.parent_comment_id = any(v_frontier)
      ) child;

    exit when coalesce(array_length(v_next, 1), 0) = 0;

    delete from public.comments where id = any(v_next);
    delete from public.guest_comments where id = any(v_next);

    v_frontier := v_next;
  end loop;

  return old;
end;
$$;