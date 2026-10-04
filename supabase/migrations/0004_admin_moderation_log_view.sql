-- KelasKita v2 follow-up: expose the moderation trail to admins.
--
-- `moderation_logs` itself stays grant-free, exactly like `reports`: no client
-- role can insert, update or delete a row, so the only writer is the definer
-- RPCs that stamp `admin_id` from `auth.uid()`.
--
-- Reading it needs a definer view for the same reason `me` does: the `WHERE`
-- clause runs as the view owner, so `auth.uid()` still resolves from the
-- caller's JWT and everybody else gets zero rows instead of an error.

create or replace view public.admin_moderation_logs with (security_invoker = false) as
  select
    l.id,
    l.admin_id,
    a.username as admin_username,
    l.action,
    l.target_type,
    l.target_id,
    l.reason,
    l.created_at
  from public.moderation_logs l
  left join public.profiles a on a.id = l.admin_id
  where (select private.is_admin());

revoke all on public.admin_moderation_logs from anon;
grant select on public.admin_moderation_logs to authenticated;