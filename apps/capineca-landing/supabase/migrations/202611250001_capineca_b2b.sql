create table if not exists public.capineca_b2b_jobs (
  id uuid primary key default gen_random_uuid(),
  request_token_hash text not null,
  input jsonb not null,
  logo_path text not null,
  research jsonb,
  concepts jsonb not null default '[]'::jsonb,
  next_concept_index integer not null default 0 check (next_concept_index between 0 and 6),
  status text not null default 'queued' check (status in ('queued', 'researching', 'generating', 'ready', 'failed')),
  processing boolean not null default false,
  processing_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 days')
);

create index if not exists capineca_b2b_jobs_expiration_idx
  on public.capineca_b2b_jobs (expires_at);

create table if not exists public.capineca_b2b_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

alter table public.capineca_b2b_jobs enable row level security;
alter table public.capineca_b2b_rate_limits enable row level security;

revoke all on table public.capineca_b2b_jobs from public, anon, authenticated;
revoke all on table public.capineca_b2b_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.capineca_b2b_jobs to service_role;
grant select, insert, update, delete on table public.capineca_b2b_rate_limits to service_role;

create or replace function public.capineca_b2b_consume_rate_limit(p_ip_hash text, p_limit integer default 3)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_attempts integer;
begin
  if p_ip_hash is null or length(p_ip_hash) <> 64 or p_limit < 1 or p_limit > 10 then
    return false;
  end if;

  insert into public.capineca_b2b_rate_limits (ip_hash, window_started_at, attempts)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set window_started_at = case
        when public.capineca_b2b_rate_limits.window_started_at < now() - interval '24 hours' then now()
        else public.capineca_b2b_rate_limits.window_started_at
      end,
      attempts = case
        when public.capineca_b2b_rate_limits.window_started_at < now() - interval '24 hours' then 1
        else public.capineca_b2b_rate_limits.attempts + 1
      end
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

revoke all on function public.capineca_b2b_consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.capineca_b2b_consume_rate_limit(text, integer) to service_role;
