alter table public.caneca_studio_jobs
  alter column created_by drop not null;

alter table public.caneca_studio_jobs
  add column guest_session_id uuid;

alter table public.caneca_studio_jobs
  add constraint caneca_studio_jobs_identity_check
  check (
    (created_by is not null and guest_session_id is null)
    or
    (created_by is null and guest_session_id is not null)
  );

create index caneca_studio_jobs_guest_created_idx
  on public.caneca_studio_jobs (guest_session_id, created_at desc)
  where guest_session_id is not null;

create table public.caneca_studio_generation_limits (
  client_ip_hash text primary key
    check (client_ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
    check (request_count between 0 and 10),
  last_seen_at timestamptz not null default now()
);

alter table public.caneca_studio_generation_limits enable row level security;
revoke all on table public.caneca_studio_generation_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.caneca_studio_generation_limits to service_role;

create policy caneca_studio_generation_limits_service_role_only
  on public.caneca_studio_generation_limits
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.consume_caneca_studio_public_limit_v1(
  p_client_ip_hash text,
  p_limit integer default 5
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  affected_rows integer;
begin
  if p_client_ip_hash is null
    or p_client_ip_hash !~ '^[0-9a-f]{64}$'
    or p_limit < 1
    or p_limit > 10
  then
    return false;
  end if;

  insert into public.caneca_studio_generation_limits as stored (
    client_ip_hash,
    window_started_at,
    request_count,
    last_seen_at
  )
  values (p_client_ip_hash, now(), 1, now())
  on conflict (client_ip_hash) do update
  set
    window_started_at = case
      when stored.window_started_at <= now() - interval '24 hours' then now()
      else stored.window_started_at
    end,
    request_count = case
      when stored.window_started_at <= now() - interval '24 hours' then 1
      else stored.request_count + 1
    end,
    last_seen_at = now()
  where
    stored.window_started_at <= now() - interval '24 hours'
    or stored.request_count < p_limit;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.consume_caneca_studio_public_limit_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_caneca_studio_public_limit_v1(text, integer)
  to service_role;
