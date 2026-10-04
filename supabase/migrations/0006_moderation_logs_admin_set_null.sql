-- KelasKita v2 follow-up: keep the moderation trail when an admin account goes.
--
-- 0002 gave `moderation_logs.admin_id` `on delete cascade`, which contradicts two
-- things in the same file:
--
--   * `reports` deliberately has no foreign key to the content it describes, so a
--     deletion cannot destroy the trail of the decision that justified it;
--   * `reports.resolved_by` already uses `on delete set null`.
--
-- Cascading from `moderation_logs` meant that deleting one admin account erased
-- every action that admin ever took, which is the one record that cannot be
-- reconstructed from anything else. The dashboard already renders the "account
-- gone" case, but with a `not null` cascade it was unreachable.
--
-- Only the FK is touched. Both moderation RPCs still insert `auth.uid()`, which
-- is non-null inside a session, so existing rows and new writes are unaffected.
--
-- `alter column drop not null` first: the old constraint cannot be recreated
-- with `on delete set null` while the column is `not null`.

begin;

alter table public.moderation_logs
  drop constraint moderation_logs_admin_id_fkey;

alter table public.moderation_logs
  alter column admin_id drop not null;

alter table public.moderation_logs
  add constraint moderation_logs_admin_id_fkey
  foreign key (admin_id) references public.profiles (id) on delete set null;

commit;
