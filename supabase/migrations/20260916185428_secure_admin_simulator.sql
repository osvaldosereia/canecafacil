alter table private.admin_users enable row level security;

grant select on private.admin_users to service_role;

create or replace view public.admin_membership_lookup
with (security_invoker = true)
as
select user_id
from private.admin_users;

revoke all on public.admin_membership_lookup from public, anon, authenticated;
grant select on public.admin_membership_lookup to service_role;
