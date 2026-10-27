create table if not exists public.caneca_studio_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  creation_mode text not null check (creation_mode in ('reference', 'from_scratch')),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  reference_path text,
  status text not null check (
    status in (
      'art_pending',
      'review_pending',
      'correction_pending',
      'mockup_front_pending',
      'mockup_back_pending',
      'needs_review',
      'failed'
    )
  ),
  processing boolean not null default false,
  processing_started_at timestamptz,
  correction_count smallint not null default 0 check (correction_count between 0 and 1),
  art_versions jsonb not null default '[]'::jsonb check (jsonb_typeof(art_versions) = 'array'),
  mockups jsonb not null default '[]'::jsonb check (jsonb_typeof(mockups) = 'array'),
  validation jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caneca_studio_jobs_owner_created_idx
  on public.caneca_studio_jobs (created_by, created_at desc);

alter table public.caneca_studio_jobs enable row level security;
revoke all on table public.caneca_studio_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.caneca_studio_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caneca-studio-assets',
  'caneca-studio-assets',
  false,
  16777216,
  array['image/webp', 'image/png', 'image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
