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

alter table public.chat_visitors enable row level security;
alter table public.chat_sessions enable row level security;

revoke all on public.chat_visitors from public, anon, authenticated;
revoke all on public.chat_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.chat_visitors to service_role;
grant select, insert, update, delete on public.chat_sessions to service_role;

create policy "service role manages chat visitors"
on public.chat_visitors for all to service_role
using (true) with check (true);

create policy "service role manages chat sessions"
on public.chat_sessions for all to service_role
using (true) with check (true);

drop index if exists public.conversations_one_open_whatsapp_per_customer;
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations drop column if exists channel;
alter table public.conversations alter column customer_id drop not null;
alter table public.conversations drop constraint if exists conversations_customer_id_fkey;
alter table public.conversations
  add constraint conversations_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.conversations
  add column visitor_id uuid not null references public.chat_visitors(id) on delete restrict;

create unique index conversations_one_open_per_visitor
on public.conversations(visitor_id)
where status = 'open';

alter table public.mug_projects alter column customer_id drop not null;
alter table public.mug_projects drop constraint if exists mug_projects_customer_id_fkey;
alter table public.mug_projects
  add constraint mug_projects_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.messages drop constraint if exists messages_direction_check;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages drop column if exists direction;
alter table public.messages drop column if exists customer_id;
alter table public.messages drop column if exists whatsapp_message_id;
alter table public.messages drop column if exists raw_payload;
alter table public.messages rename column type to message_kind;
alter table public.messages rename column text to text_content;

alter table public.messages
  add column sender_type text not null,
  add column structured_content jsonb not null default '{}'::jsonb,
  add column client_message_id text,
  add column reply_to_message_id uuid references public.messages(id) on delete set null,
  add column processing_state text not null default 'completed',
  add column updated_at timestamptz not null default now(),
  add constraint messages_sender_type_check check (
    sender_type = any (array['customer','ai','human','system','automation'])
  ),
  add constraint messages_kind_check check (
    message_kind = any (array['text','image','audio','document','system','component','notice'])
  ),
  add constraint messages_processing_state_check check (
    processing_state = any (array['received','processing','completed','failed'])
  ),
  add constraint messages_conversation_client_message_key unique (conversation_id, client_message_id);

create unique index messages_one_ai_reply_per_customer_message
on public.messages(reply_to_message_id)
where sender_type = 'ai' and reply_to_message_id is not null;

alter table public.project_media rename to media_assets;
alter table public.media_assets alter column project_id drop not null;
alter table public.media_assets
  add column conversation_id uuid not null references public.conversations(id) on delete cascade,
  add column size_bytes bigint check (size_bytes is null or size_bytes >= 0);
alter table public.media_assets
  drop constraint if exists project_media_project_id_storage_bucket_storage_path_key;
alter table public.media_assets
  add constraint media_assets_storage_object_key unique (storage_bucket, storage_path);
create index media_assets_conversation_created_idx
  on public.media_assets(conversation_id, created_at);

alter table public.audio_transcriptions
  rename column project_media_id to media_asset_id;

alter table public.customers drop column if exists whatsapp_id;

drop function if exists public.ingest_whatsapp_inbound(text, text, text, text, text, jsonb, timestamptz);

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

  insert into public.chat_visitors default values
  returning id into v_visitor_id;

  insert into public.chat_sessions(visitor_id, token_hash, expires_at)
  values (v_visitor_id, p_token_hash, p_expires_at)
  returning id into v_session_id;

  insert into public.conversations(visitor_id, customer_id, status, automation_mode)
  values (v_visitor_id, null, 'open', 'ai')
  returning id into v_conversation_id;

  return query select v_session_id, v_visitor_id, v_conversation_id;
end;
$$;

revoke all on function public.create_chat_session(text, timestamptz) from public;
revoke all on function public.create_chat_session(text, timestamptz) from anon, authenticated;
grant execute on function public.create_chat_session(text, timestamptz) to service_role;
