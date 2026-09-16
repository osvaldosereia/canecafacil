-- Caneca Fácil — active schema snapshot
-- Project ref: ijquzclfijwfgwupoxmg
-- Region: sa-east-1
-- This file documents the current first-party chat architecture.
-- Historical evolution lives in supabase/migrations/ and must remain immutable.
-- Do not apply this snapshot blindly over an existing project.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;
grant select on private.admin_users to service_role;

create policy service_role_select_admin_users
on private.admin_users for select to service_role
using (true);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace view public.admin_membership_lookup
with (security_invoker = true)
as
select user_id from private.admin_users;
revoke all on public.admin_membership_lookup from public, anon, authenticated;
grant select on public.admin_membership_lookup to service_role;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  normalized_phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text,
  first_contact_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now()
);

create table public.chat_visitors (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.chat_visitors(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_message_at timestamptz,
  active_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  automation_mode text not null default 'ai' check (automation_mode in ('ai','human','paused')),
  needs_attention boolean not null default false,
  attention_reason text,
  visitor_id uuid not null references public.chat_visitors(id) on delete restrict,
  check (
    (needs_attention = true and nullif(btrim(attention_reason), '') is not null)
    or (needs_attention = false and attention_reason is null)
  )
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_kind text not null check (message_kind in ('text','image','audio','document','system','component','notice')),
  text_content text,
  created_at timestamptz not null default now(),
  sender_type text not null check (sender_type in ('customer','ai','human','system','automation')),
  structured_content jsonb not null default '{}'::jsonb,
  client_message_id text,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  processing_state text not null default 'completed' check (processing_state in ('received','processing','completed','failed')),
  updated_at timestamptz not null default now(),
  unique (conversation_id, client_message_id)
);

create table public.mug_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  capacity_ml integer check (capacity_ml is null or capacity_ml > 0),
  art_width_mm numeric(10,2) check (art_width_mm is null or art_width_mm > 0),
  art_height_mm numeric(10,2) check (art_height_mm is null or art_height_mm > 0),
  aspect_ratio numeric(10,4) check (aspect_ratio is null or aspect_ratio > 0),
  safe_margin_mm numeric(10,2),
  output_width_px integer check (output_width_px is null or output_width_px > 0),
  output_height_px integer check (output_height_px is null or output_height_px > 0),
  dpi integer default 300 check (dpi is null or dpi > 0),
  background_mode text default 'white',
  mockup_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mug_projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  template_id uuid references public.mug_templates(id) on delete set null,
  title text,
  creation_mode text not null check (creation_mode in ('reference','from_scratch')),
  status text not null default 'new' check (status in (
    'new','collecting_references','building_briefing','waiting_customer','ready_to_generate',
    'generating_art','validating_art','generating_mockup','waiting_approval','change_requested',
    'needs_review','approved','failed'
  )),
  current_briefing_id uuid,
  current_art_version_id uuid,
  current_mockup_id uuid,
  approved_art_version_id uuid,
  approved_mockup_id uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations
  add constraint conversations_active_project_fk
  foreign key (active_project_id) references public.mug_projects(id) on delete set null;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.mug_projects(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  media_type text not null check (media_type in ('image','audio','document')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  original_filename text,
  duration_seconds numeric(12,3) check (duration_seconds is null or duration_seconds >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  reference_order integer check (reference_order is null or reference_order > 0),
  reference_role text,
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  unique (storage_bucket, storage_path)
);

create table public.audio_transcriptions (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  transcription text not null,
  language text,
  model text,
  created_at timestamptz not null default now()
);

create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mug_projects(id) on delete cascade,
  version integer not null check (version > 0),
  creation_mode text not null check (creation_mode in ('reference','from_scratch')),
  occasion text,
  recipient text,
  main_theme text,
  desired_style text,
  color_preferences jsonb not null default '[]'::jsonb,
  mandatory_text jsonb not null default '[]'::jsonb,
  names jsonb not null default '[]'::jsonb,
  dates jsonb not null default '[]'::jsonb,
  mandatory_elements jsonb not null default '[]'::jsonb,
  forbidden_elements jsonb not null default '[]'::jsonb,
  reference_items jsonb not null default '[]'::jsonb,
  composition_notes text,
  creative_direction text,
  missing_information jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,4) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  ready_to_generate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.art_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mug_projects(id) on delete cascade,
  briefing_id uuid references public.briefings(id) on delete set null,
  version integer not null check (version > 0),
  parent_version_id uuid references public.art_versions(id) on delete set null,
  generation_type text not null check (generation_type in ('initial','edit','regeneration','auto_correction')),
  prompt_used text,
  model text,
  storage_bucket text not null default 'artwork-master',
  storage_path text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  aspect_ratio numeric(10,4) check (aspect_ratio is null or aspect_ratio > 0),
  generation_status text not null default 'completed' check (generation_status in ('pending','running','completed','failed')),
  quality_status text check (quality_status in ('pending','approved','rejected','needs_review')),
  validation_result jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.mockup_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mug_projects(id) on delete cascade,
  art_version_id uuid not null references public.art_versions(id) on delete cascade,
  template_id uuid references public.mug_templates(id) on delete set null,
  version integer not null check (version > 0),
  prompt_used text,
  model text,
  storage_bucket text not null default 'mockups',
  storage_path text not null,
  generation_status text not null default 'completed' check (generation_status in ('pending','running','completed','failed')),
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mug_projects(id) on delete cascade,
  art_version_id uuid references public.art_versions(id) on delete set null,
  mockup_id uuid references public.mockup_versions(id) on delete set null,
  event_type text not null check (event_type in ('sent_for_review','approved','change_requested','rejected','internal_rejected')),
  customer_message text,
  ai_interpretation jsonb,
  created_at timestamptz not null default now()
);

alter table public.mug_projects
  add constraint mug_projects_current_briefing_fk foreign key (current_briefing_id) references public.briefings(id) on delete set null,
  add constraint mug_projects_current_art_version_fk foreign key (current_art_version_id) references public.art_versions(id) on delete set null,
  add constraint mug_projects_current_mockup_fk foreign key (current_mockup_id) references public.mockup_versions(id) on delete set null,
  add constraint mug_projects_approved_art_version_fk foreign key (approved_art_version_id) references public.art_versions(id) on delete set null,
  add constraint mug_projects_approved_mockup_fk foreign key (approved_mockup_id) references public.mockup_versions(id) on delete set null;

create unique index conversations_one_open_per_visitor
  on public.conversations(visitor_id) where status = 'open';
create index conversations_customer_idx on public.conversations(customer_id, last_message_at desc);
create index conversations_active_project_id_idx on public.conversations(active_project_id);
create index chat_sessions_visitor_id_idx on public.chat_sessions(visitor_id);
create index chat_visitors_customer_id_idx on public.chat_visitors(customer_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create unique index messages_one_ai_reply_per_customer_message
  on public.messages(reply_to_message_id)
  where sender_type = 'ai' and reply_to_message_id is not null;
create index mug_projects_customer_created_idx on public.mug_projects(customer_id, created_at desc);
create index mug_projects_status_created_idx on public.mug_projects(status, created_at desc);
create index mug_projects_conversation_id_idx on public.mug_projects(conversation_id);
create index mug_projects_template_id_idx on public.mug_projects(template_id);
create index mug_projects_current_briefing_id_idx on public.mug_projects(current_briefing_id);
create index mug_projects_current_art_version_id_idx on public.mug_projects(current_art_version_id);
create index mug_projects_current_mockup_id_idx on public.mug_projects(current_mockup_id);
create index mug_projects_approved_art_version_id_idx on public.mug_projects(approved_art_version_id);
create index mug_projects_approved_mockup_id_idx on public.mug_projects(approved_mockup_id);
create index media_assets_project_created_idx on public.media_assets(project_id, created_at);
create index media_assets_message_id_idx on public.media_assets(message_id);
create index media_assets_conversation_created_idx on public.media_assets(conversation_id, created_at);
create index briefings_project_version_idx on public.briefings(project_id, version desc);
create index art_versions_project_version_idx on public.art_versions(project_id, version desc);
create index art_versions_briefing_id_idx on public.art_versions(briefing_id);
create index art_versions_parent_version_id_idx on public.art_versions(parent_version_id);
create index mockup_versions_project_version_idx on public.mockup_versions(project_id, version desc);
create index mockup_versions_art_version_id_idx on public.mockup_versions(art_version_id);
create index mockup_versions_template_id_idx on public.mockup_versions(template_id);
create index review_events_project_created_idx on public.review_events(project_id, created_at);
create index review_events_art_version_id_idx on public.review_events(art_version_id);
create index review_events_mockup_id_idx on public.review_events(mockup_id);

create or replace function public.create_chat_session(
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(session_id uuid, visitor_id uuid, conversation_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_visitor_id uuid;
  v_session_id uuid;
  v_conversation_id uuid;
begin
  if nullif(btrim(p_token_hash), '') is null then
    raise exception 'session token hash is required';
  end if;
  if p_expires_at <= now() then
    raise exception 'session expiration must be in the future';
  end if;

  insert into public.chat_visitors default values returning id into v_visitor_id;
  insert into public.chat_sessions(visitor_id, token_hash, expires_at)
    values (v_visitor_id, p_token_hash, p_expires_at) returning id into v_session_id;
  insert into public.conversations(visitor_id, customer_id, status, automation_mode)
    values (v_visitor_id, null, 'open', 'ai') returning id into v_conversation_id;

  return query select v_session_id, v_visitor_id, v_conversation_id;
end;
$$;
revoke all on function public.create_chat_session(text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_chat_session(text, timestamptz) to service_role;

insert into public.mug_templates (
  name, active, capacity_ml, dpi, background_mode, mockup_configuration
) values (
  'Caneca Tradicional Branca 350 ml', true, 350, 300, 'white',
  jsonb_build_object(
    'mockup_style', 'emotional_commercial',
    'show_both_sides', true,
    'single_image', true,
    'dimensions_require_admin_configuration', true
  )
);

alter table public.customers enable row level security;
alter table public.chat_visitors enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.mug_templates enable row level security;
alter table public.mug_projects enable row level security;
alter table public.media_assets enable row level security;
alter table public.audio_transcriptions enable row level security;
alter table public.briefings enable row level security;
alter table public.art_versions enable row level security;
alter table public.mockup_versions enable row level security;
alter table public.review_events enable row level security;

revoke all on public.chat_visitors, public.chat_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.chat_visitors, public.chat_sessions to service_role;

create policy "service role manages chat visitors" on public.chat_visitors
for all to service_role using (true) with check (true);
create policy "service role manages chat sessions" on public.chat_sessions
for all to service_role using (true) with check (true);

revoke all on public.customers, public.conversations, public.messages, public.mug_templates,
  public.mug_projects, public.media_assets, public.audio_transcriptions, public.briefings,
  public.art_versions, public.mockup_versions, public.review_events from anon;
grant select, insert, update, delete on public.customers, public.conversations, public.messages,
  public.mug_templates, public.mug_projects, public.media_assets, public.audio_transcriptions,
  public.briefings, public.art_versions, public.mockup_versions, public.review_events to authenticated;

create policy admin_all_customers on public.customers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_conversations on public.conversations for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_messages on public.messages for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_mug_templates on public.mug_templates for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_mug_projects on public.mug_projects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_media_assets on public.media_assets for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_audio_transcriptions on public.audio_transcriptions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_briefings on public.briefings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_art_versions on public.art_versions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_mockup_versions on public.mockup_versions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all_review_events on public.review_events for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('customer-uploads', 'customer-uploads', false, 26214400),
  ('artwork-master', 'artwork-master', false, 26214400),
  ('mockups', 'mockups', false, 26214400)
on conflict (id) do nothing;

create policy caneca_admin_storage_select on storage.objects
for select to authenticated
using (bucket_id in ('customer-uploads','artwork-master','mockups') and (select private.is_admin()));
create policy caneca_admin_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id in ('customer-uploads','artwork-master','mockups') and (select private.is_admin()));
create policy caneca_admin_storage_update on storage.objects
for update to authenticated
using (bucket_id in ('customer-uploads','artwork-master','mockups') and (select private.is_admin()))
with check (bucket_id in ('customer-uploads','artwork-master','mockups') and (select private.is_admin()));
create policy caneca_admin_storage_delete on storage.objects
for delete to authenticated
using (bucket_id in ('customer-uploads','artwork-master','mockups') and (select private.is_admin()));
