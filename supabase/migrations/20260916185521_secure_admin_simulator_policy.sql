create policy "service_role_select_admin_users"
on private.admin_users
for select
to service_role
using (true);
