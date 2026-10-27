create policy caneca_studio_jobs_service_role_only
on public.caneca_studio_jobs
for all
to service_role
using (true)
with check (true);
