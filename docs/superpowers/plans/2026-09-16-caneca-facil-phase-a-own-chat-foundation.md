# Caneca Fácil Phase A — Own Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Meta/WhatsApp runtime with a secure first-party conversational foundation where an anonymous visitor can start, resume and use a spacious mobile-first chat with idempotent messages, SSE streaming and private media uploads.

**Architecture:** The browser talks only to the Caneca Fácil Hono API. The API issues a revocable anonymous session through an HttpOnly cookie, persists provider-neutral conversation/message data in Supabase using the service-role client, streams assistant output over SSE, and owns private media uploads. `apps/chat` is a React/Vite customer surface designed as a calm conversation, not a storefront page. No OpenAI call is required in this phase; a deterministic foundation responder proves the transport and is replaced by the structured AI orchestrator in Phase B.

**Tech Stack:** Node 24, TypeScript 5.9.3, Hono 4.13.7, React 19.3.0, React DOM 19.3.0, Vite 8.3.0, Vitest 5.0.0, Supabase JS 2.116.0, Postgres 17, SSE.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`

## Global Constraints

- Meta/WhatsApp must not be required by runtime code, configuration, customer UI or the active database contract.
- Historical migrations stay immutable; Meta database artifacts are retired only through new forward migrations.
- Start implementation from `main`; do not merge `feat/caneca-facil-briefing-simulator` wholesale.
- Customer chat uses generous whitespace, one meaningful decision at a time and no ecommerce-site chrome.
- Customer browser never receives Supabase service-role or provider secrets.
- Customer chat uses the Caneca Fácil API rather than direct Supabase table access.
- Anonymous session credentials are stored only in an HttpOnly cookie and only a SHA-256 hash is persisted.
- Mutating customer routes require the configured `CHAT_ORIGIN` and a valid non-revoked session.
- Message retries are idempotent by `(conversation_id, client_message_id)`.
- Customer and creative media stays in private storage.
- Phase A does not call OpenAI and does not implement product recommendation, art generation, checkout or payment.
- Database DDL is applied only with `Supabase.apply_migration` and mirrored exactly into `supabase/migrations/`.
- Run Supabase security advisors after the schema migration.
- Every code task follows RED → minimal GREEN → refactor only while green.
- Final gate requires `npm test`, `npm run typecheck`, `npm run build`, production API smoke test and the no-Meta source scan.

---

### Task 1: Remove Meta From the Runtime Boundary

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces `ApiConfig` with `supabaseUrl`, `supabaseSecretKey`, `chatOrigin`, `nodeEnv`, `sessionCookieName`, `sessionTtlDays`, `port`.
- Produces an API app that exposes `/health` and own-chat routes only; no Meta webhook registration.
- Later tasks consume `chatOrigin`, `nodeEnv`, `sessionCookieName`, and `sessionTtlDays`.

- [ ] **Step 1: Write failing configuration tests.**

```ts
it('loads the own-chat runtime without Meta variables', () => {
  expect(loadApiConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    CHAT_ORIGIN: 'http://localhost:5174',
  })).toMatchObject({
    supabaseUrl: 'https://example.supabase.co',
    chatOrigin: 'http://localhost:5174',
    nodeEnv: 'development',
    sessionCookieName: 'cf_session',
    sessionTtlDays: 30,
    port: 3000,
  });
});

it('rejects an invalid session TTL', () => {
  expect(() => loadApiConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    CHAT_ORIGIN: 'http://localhost:5174',
    SESSION_TTL_DAYS: '0',
  })).toThrow('SESSION_TTL_DAYS must be an integer between 1 and 365');
});
```

- [ ] **Step 2: Write a failing API test proving the Meta route is absent.**

```ts
it('does not register a Meta webhook', async () => {
  const app = createApiApp({});
  const response = await app.request('/webhooks/whatsapp?hub.mode=subscribe');
  expect(response.status).toBe(404);
});
```

- [ ] **Step 3: Run focused tests and confirm RED.**

Run: `npm run test --workspace apps/api -- config.test.ts app.test.ts`

Expected: FAIL because current configuration still requires `WHATSAPP_*` and `app.ts` still wires the webhook.

- [ ] **Step 4: Implement the minimal provider-neutral configuration.**

```ts
export interface ApiConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  chatOrigin: string;
  nodeEnv: 'development' | 'test' | 'production';
  sessionCookieName: string;
  sessionTtlDays: number;
  port: number;
}
```

`loadApiConfig` rules:

```ts
chatOrigin: requireValue(env, 'CHAT_ORIGIN'),
nodeEnv: parseNodeEnv(env.NODE_ENV),
sessionCookieName: optionalValue(env, 'SESSION_COOKIE_NAME') ?? 'cf_session',
sessionTtlDays: parseSessionTtlDays(env.SESSION_TTL_DAYS),
```

Delete all `whatsapp*` properties from `ApiConfig` and remove webhook imports/registration from `createApiApp`.

- [ ] **Step 5: Replace `apps/api/.env.example` with the own-chat runtime contract.**

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_replace_me
CHAT_ORIGIN=http://localhost:5174
NODE_ENV=development
SESSION_COOKIE_NAME=cf_session
SESSION_TTL_DAYS=30
PORT=3000
```

- [ ] **Step 6: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace apps/api -- config.test.ts app.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/.env.example
git commit -m "refactor: remove Meta runtime dependency"
```

---

### Task 2: Migrate Supabase to a Provider-Neutral Chat Schema

**Files:**
- Create: exact migration filename returned by `Supabase.apply_migration` for migration name `own_chat_foundation`
- Modify: `supabase/schema/initial_caneca_facil.sql`
- Verify/modify later references to `project_media` after it becomes `media_assets`

**Interfaces:**
- Produces `chat_visitors`, `chat_sessions`.
- Generalizes `conversations`, `messages`, `mug_projects` and `project_media`.
- Renames `project_media` to `media_assets`; existing `audio_transcriptions.project_media_id` foreign key continues to reference the renamed table automatically.
- Produces service-role-only `create_chat_session(token_hash, expires_at)` RPC.
- Removes `ingest_whatsapp_inbound` from active database API.

- [ ] **Step 1: Verify destructive-chat tables are still empty before DDL.**

Run with `Supabase.execute_sql`:

```sql
select
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.project_media) as project_media;
```

Expected on the current project: all three counts are `0`. If any is non-zero, stop this task and write a data-preserving migration instead of using the empty-table migration below.

- [ ] **Step 2: Apply migration `own_chat_foundation` with exactly this provider-neutral contract.**

```sql
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
alter table public.conversations
  add column visitor_id uuid not null references public.chat_visitors(id) on delete restrict;

create unique index conversations_one_open_per_visitor
on public.conversations(visitor_id)
where status = 'open';

alter table public.mug_projects alter column customer_id drop not null;

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

alter table public.customers drop column if exists whatsapp_id;

drop function if exists public.ingest_whatsapp_inbound(text, text, text, text, text, text, jsonb);

create or replace function public.create_chat_session(
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(session_id uuid, visitor_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid;
  v_session_id uuid;
  v_conversation_id uuid;
begin
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

revoke all on function public.create_chat_session(text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_chat_session(text, timestamptz) to service_role;
```

- [ ] **Step 3: Mirror the exact applied migration SQL into the exact versioned file returned by Supabase.**

Do not invent a timestamp. The repository file name must exactly match the version shown by `Supabase.list_migrations` after application.

- [ ] **Step 4: Update `supabase/schema/initial_caneca_facil.sql` to describe the new active schema rather than Meta fields.**

Keep historical migration files unchanged.

- [ ] **Step 5: Verify schema and permissions.**

Run:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
order by ordinal_position;

select has_table_privilege('anon', 'public.chat_sessions', 'select') as anon_can_select,
       has_table_privilege('authenticated', 'public.chat_sessions', 'select') as auth_can_select,
       has_function_privilege('service_role', 'public.create_chat_session(text,timestamptz)', 'execute') as service_can_create;
```

Expected: `messages` contains the provider-neutral columns; `anon_can_select=false`, `auth_can_select=false`, `service_can_create=true`.

- [ ] **Step 6: Run Supabase security advisor.**

Expected: no new security warning caused by the migration.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations supabase/schema/initial_caneca_facil.sql
git commit -m "feat: add provider-neutral chat schema"
```

---

### Task 3: Implement Anonymous Session Tokens and Store

**Files:**
- Create: `apps/api/src/chat/session-token.ts`
- Create: `apps/api/src/chat/session-token.test.ts`
- Create: `apps/api/src/chat/session-store.ts`
- Create: `apps/api/src/chat/supabase-session-store.ts`
- Create: `apps/api/src/chat/supabase-session-store.test.ts`

**Interfaces:**

```ts
export interface ChatSessionIdentity {
  sessionId: string;
  visitorId: string;
  conversationId: string;
  expiresAt: string;
}

export interface ChatSessionStore {
  create(tokenHash: string, expiresAt: Date): Promise<ChatSessionIdentity>;
  resolve(tokenHash: string, now: Date): Promise<ChatSessionIdentity | null>;
  touch(identity: ChatSessionIdentity, now: Date): Promise<void>;
}

export function createOpaqueSessionToken(): string;
export function hashSessionToken(token: string): string;
```

- [ ] **Step 1: Write failing token tests.**

```ts
it('creates URL-safe high-entropy tokens and stores only a stable hash', () => {
  const token = createOpaqueSessionToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  expect(hashSessionToken(token)).not.toContain(token);
});
```

- [ ] **Step 2: Run token test and confirm RED.**

Run: `npm run test --workspace apps/api -- session-token.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement token helpers using Node `crypto`.**

```ts
export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
```

- [ ] **Step 4: Write failing Supabase-store tests.** Cover atomic RPC creation, resolution that rejects expired/revoked rows, and touch updating both session and visitor last-seen timestamps.

```ts
await expect(store.resolve(hash, now)).resolves.toEqual({
  sessionId: 'session-1',
  visitorId: 'visitor-1',
  conversationId: 'conversation-1',
  expiresAt: '2026-10-16T12:00:00.000Z',
});
```

- [ ] **Step 5: Implement `createSupabaseChatSessionStore(client)`.**

Creation calls `create_chat_session`. Resolution queries `chat_sessions`, joins `chat_visitors`, and finds the visitor's open conversation. It must require `revoked_at IS NULL` and `expires_at > now`.

- [ ] **Step 6: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace apps/api -- session-token.test.ts supabase-session-store.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/chat
git commit -m "feat: add anonymous chat sessions"
```

---

### Task 4: Expose Secure Session Bootstrap and Recovery

**Files:**
- Create: `apps/api/src/chat/session-routes.ts`
- Create: `apps/api/src/chat/session-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `POST /v1/chat/session` creates or resumes the current anonymous session.
- `GET /v1/chat/session` returns the current identity if the cookie is valid, otherwise `401`.
- Cookie name comes from `ApiConfig.sessionCookieName`.
- Cookie is HttpOnly, SameSite=Strict, Path=/, Max-Age based on `sessionTtlDays`, and Secure when `nodeEnv === 'production'`.

- [ ] **Step 1: Write failing route tests.**

```ts
it('creates a session and never exposes the raw token in JSON', async () => {
  const response = await app.request('/v1/chat/session', { method: 'POST', headers: { Origin: 'http://localhost:5174' } });
  expect(response.status).toBe(201);
  expect(response.headers.get('set-cookie')).toContain('cf_session=');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  await expect(response.json()).resolves.toEqual({
    visitorId: 'visitor-1',
    conversationId: 'conversation-1',
  });
});
```

Also test wrong `Origin` → `403`, valid cookie recovery → same identity, expired/revoked cookie → `401` for GET and new session for POST.

- [ ] **Step 2: Run focused tests and confirm RED.**

Run: `npm run test --workspace apps/api -- session-routes.test.ts`

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Implement exact-origin enforcement and session cookie handling.** Use Hono cookie helpers; never return the token in JSON or logs.

- [ ] **Step 4: Register routes in `createApiApp` with injected `ChatSessionStore` support for tests and Supabase-backed defaults in production.**

- [ ] **Step 5: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace apps/api -- session-routes.test.ts app.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/chat/session-routes.ts apps/api/src/chat/session-routes.test.ts apps/api/src/app.ts
git commit -m "feat: expose own-chat session bootstrap"
```

---

### Task 5: Implement Provider-Neutral Messages and Idempotent Persistence

**Files:**
- Create: `packages/core/src/chat.ts`
- Create: `packages/core/src/chat.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/api/src/chat/message-store.ts`
- Create: `apps/api/src/chat/supabase-message-store.ts`
- Create: `apps/api/src/chat/supabase-message-store.test.ts`
- Modify: `apps/api/package.json` to depend on `@caneca-facil/core: 0.1.0`
- Modify root `package-lock.json` through `npm install`

**Interfaces:**

```ts
export type ChatSenderType = 'customer' | 'ai' | 'human' | 'system' | 'automation';
export type ChatMessageKind = 'text' | 'image' | 'audio' | 'document' | 'system' | 'component' | 'notice';
export type ChatProcessingState = 'received' | 'processing' | 'completed' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  messageKind: ChatMessageKind;
  textContent: string | null;
  structuredContent: Record<string, unknown>;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  processingState: ChatProcessingState;
  createdAt: string;
  updatedAt: string;
}
```

`ChatMessageStore` produces:

```ts
appendCustomerText(input): Promise<{ message: ChatMessage; accepted: boolean }>;
createAssistantDraft(replyToMessageId: string, conversationId: string): Promise<{ message: ChatMessage; created: boolean }>;
completeAssistantText(messageId: string, text: string): Promise<ChatMessage>;
listConversation(conversationId: string): Promise<ChatMessage[]>;
```

- [ ] **Step 1: Write failing core validation tests.** Reject blank customer text, trim outer whitespace, cap text at 8,000 UTF-16 code units, and require a UUID-shaped `clientMessageId`.

- [ ] **Step 2: Run core tests and confirm RED.**

Run: `npm run test --workspace packages/core -- chat.test.ts`

Expected: FAIL because chat domain does not exist.

- [ ] **Step 3: Implement the minimal chat types and `normalizeCustomerTextTurn`.**

- [ ] **Step 4: Write failing message-store tests.** Prove that repeating the same `(conversationId, clientMessageId)` returns the original customer message with `accepted=false`, and that only one AI draft can exist for a customer message.

- [ ] **Step 5: Implement the Supabase message store using the unique constraints from Task 2.** On a duplicate customer insert, select and return the existing row rather than throwing to the API caller.

- [ ] **Step 6: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace packages/core -- chat.test.ts && npm run test --workspace apps/api -- supabase-message-store.test.ts`

Expected: PASS.

- [ ] **Step 7: Run `npm install` and commit the workspace dependency/lockfile.**

```bash
npm install
git add packages/core apps/api/package.json package-lock.json apps/api/src/chat
git commit -m "feat: add provider-neutral chat messages"
```

---

### Task 6: Stream Customer Turns Over SSE

**Files:**
- Create: `apps/api/src/chat/responder.ts`
- Create: `apps/api/src/chat/responder.test.ts`
- Create: `apps/api/src/chat/turn-routes.ts`
- Create: `apps/api/src/chat/turn-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**

```ts
export interface ChatResponderInput {
  conversationId: string;
  visitorId: string;
  customerMessage: ChatMessage;
}

export interface ChatResponder {
  respond(input: ChatResponderInput): AsyncIterable<string>;
}
```

Phase A default responder returns deterministic conversational copy in short chunks:

`Entendi. Pode continuar me contando como você imagina sua caneca.`

`POST /v1/chat/turns` request:

```json
{
  "clientMessageId": "7c4c0c87-b137-4df4-90d7-f31c88940864",
  "text": "Quero uma caneca para minha esposa"
}
```

SSE events:

```text
event: accepted
data: {"messageId":"...","accepted":true}

event: text_delta
data: {"delta":"Entendi. "}

event: done
data: {"assistantMessageId":"..."}
```

- [ ] **Step 1: Write failing responder test.** Prove deterministic output and no OpenAI dependency/import.

- [ ] **Step 2: Write failing route tests.** Cover missing session `401`, wrong origin `403`, first turn accepted, duplicate `clientMessageId` not duplicated, streamed deltas, durable completed assistant reply, and replay returning the existing completed assistant response rather than creating a second reply.

- [ ] **Step 3: Run focused tests and confirm RED.**

Run: `npm run test --workspace apps/api -- responder.test.ts turn-routes.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement the deterministic `createFoundationResponder`.** It must not import `openai`.

- [ ] **Step 5: Implement `POST /v1/chat/turns` with Hono `streamSSE`.** Validate origin/session first, normalize the customer turn, persist idempotently, create/reuse the AI draft, stream chunks, then mark the assistant message `completed` with the accumulated final text.

If streaming fails after draft creation, set the draft to `failed`; never delete the customer turn.

- [ ] **Step 6: Add `GET /v1/chat/conversation` to return durable ordered message history for the current session's conversation.**

- [ ] **Step 7: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace apps/api -- responder.test.ts turn-routes.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/chat apps/api/src/app.ts
git commit -m "feat: stream own-chat turns over SSE"
```

---

### Task 7: Replace Meta Media Retrieval With Private Own-Chat Uploads

**Files:**
- Create: `apps/api/src/media/media-store.ts`
- Create: `apps/api/src/media/supabase-media-store.ts`
- Create: `apps/api/src/media/supabase-media-store.test.ts`
- Create: `apps/api/src/media/upload-routes.ts`
- Create: `apps/api/src/media/upload-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Retire later in Task 9: `apps/api/src/media/whatsapp-media.ts`, `apps/api/src/media/whatsapp-media.test.ts`, `apps/api/src/media/project-media-store.ts`, `apps/api/src/media/project-media-store.test.ts`

**Interfaces:**

Allowed MVP upload MIME types:

```ts
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'] as const;
```

Limits:

- image: 10 MiB;
- audio: 20 MiB;
- unsupported type: `415`;
- file above limit: `413`.

Storage path:

```text
own-chat/{visitorId}/{conversationId}/{mediaId}/{sanitizedFilename}
```

`POST /v1/chat/media` returns only safe metadata:

```json
{
  "id": "media-uuid",
  "mediaType": "image",
  "mimeType": "image/jpeg",
  "originalFilename": "referencia.jpg",
  "sizeBytes": 123456
}
```

It never returns a permanent public storage URL.

- [ ] **Step 1: Write failing media-store tests.** Prove deterministic private bucket `customer-uploads`, correct own-chat path, inserted `media_assets.conversation_id`, and no public URL generation.

- [ ] **Step 2: Write failing upload-route tests.** Cover session/origin protection, allowed image/audio, unsupported MIME, size limit, and filename sanitization.

- [ ] **Step 3: Run focused tests and confirm RED.**

Run: `npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts`

Expected: FAIL because own-chat upload modules do not exist.

- [ ] **Step 4: Implement `createSupabaseMediaStore` and multipart upload route.** Upload bytes through the server-side Supabase client into private bucket `customer-uploads`, then insert `media_assets` row. On database insert failure after storage success, remove the uploaded object before returning an error.

- [ ] **Step 5: Run focused tests and confirm GREEN.**

Run: `npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/media apps/api/src/app.ts
git commit -m "feat: add private own-chat media uploads"
```

---

### Task 8: Build the Human, Spacious `apps/chat` Customer Shell

**Files:**
- Create: `apps/chat/package.json`
- Create: `apps/chat/tsconfig.json`
- Create: `apps/chat/vite.config.ts`
- Create: `apps/chat/index.html`
- Create: `apps/chat/.env.example`
- Create: `apps/chat/src/main.tsx`
- Create: `apps/chat/src/App.tsx`
- Create: `apps/chat/src/App.test.tsx`
- Create: `apps/chat/src/components/ChatShell.tsx`
- Create: `apps/chat/src/components/ConversationMessage.tsx`
- Create: `apps/chat/src/components/Composer.tsx`
- Create: `apps/chat/src/lib/chat-api.ts`
- Create: `apps/chat/src/lib/chat-api.test.ts`
- Create: `apps/chat/src/lib/sse.ts`
- Create: `apps/chat/src/lib/sse.test.ts`
- Create: `apps/chat/src/styles.css`
- Create: `apps/chat/public/manifest.webmanifest`
- Modify root `package-lock.json` through `npm install`

**Interfaces:**
- `VITE_API_URL=http://localhost:3000`
- Browser boot calls `POST /v1/chat/session` with `credentials: 'include'`, then `GET /v1/chat/conversation`.
- Composer sends a UUID `clientMessageId` and consumes the SSE response from `POST /v1/chat/turns` using `fetch` streaming.
- Upload action posts multipart to `/v1/chat/media` with credentials.

**Visual constants that must be present in `styles.css`:**

```css
:root {
  --chat-max-width: 720px;
  --chat-turn-gap: 32px;
  --chat-inline-gap: 12px;
  --chat-page-padding: clamp(20px, 5vw, 48px);
  --chat-radius: 22px;
}
```

Customer-layout rules:

```css
.chat-shell {
  width: min(100%, var(--chat-max-width));
  margin: 0 auto;
  padding: var(--chat-page-padding) 20px 120px;
}

.conversation-thread {
  display: flex;
  flex-direction: column;
  gap: var(--chat-turn-gap);
}
```

Do not render a permanent `<nav>`, sidebar, category grid, hero banner, footer catalog or ecommerce header.

- [ ] **Step 1: Create `apps/chat/package.json` using the repository versions.**

```json
{
  "name": "@caneca-facil/chat",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "build": "vite build"
  },
  "dependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "vite": "8.3.0"
  }
}
```

- [ ] **Step 2: Write failing SSE parser tests.** Cover partial chunks split across reads, multiple events in one chunk and UTF-8 text.

- [ ] **Step 3: Write failing API-client tests.** Prove `credentials: 'include'`, session bootstrap, history load, streaming turn and multipart upload.

- [ ] **Step 4: Write failing visual-shell tests.**

```ts
it('renders a conversation instead of a website shell', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Oi!');
  expect(html).toContain('Me conta o que você imagina');
  expect(html).not.toContain('<nav');
  expect(html).not.toContain('Categorias');
  expect(html).not.toContain('Comprar agora');
});
```

- [ ] **Step 5: Run chat tests and confirm RED.**

Run: `npm run test --workspace apps/chat`

Expected: FAIL because implementation is incomplete.

- [ ] **Step 6: Implement the minimal SSE parser and API client.** Do not introduce a third-party state manager in Phase A.

- [ ] **Step 7: Implement the chat shell with this initial conversational copy.**

AI/open layout greeting:

```text
Oi! 👋
Vamos criar uma caneca do seu jeito?

Me conta o que você imagina. Se preferir, pode mandar uma foto ou áudio também.
```

Composer placeholder:

```text
Me conta o que você imagina...
```

Keep the wordmark small and quiet. The message thread is the primary visual object.

- [ ] **Step 8: Implement optimistic customer messages carefully.** On submit, show the local customer turn immediately. If the API rejects it, preserve the drafted content and show an inline retry action; do not erase the text.

- [ ] **Step 9: Implement streaming assistant text in an open layout.** Avoid putting every AI message inside a bordered bubble. The customer message may use a subtle compact bubble aligned right; AI text should use whitespace and typography as the primary separation.

- [ ] **Step 10: Implement image/audio attachment selection and upload status.** Attachments are sent to `/v1/chat/media`; Phase A shows safe filename/type state only. Audio recording with `MediaRecorder` is intentionally not part of Phase A; it enters the Conversational AI/Media UX work once the upload foundation is stable.

- [ ] **Step 11: Add `manifest.webmanifest` with app name `Caneca Fácil`, display `standalone`, start URL `/`, and the same calm background/theme values used by the shell.** A service worker is not introduced in Phase A because chat/offline replay semantics are not yet defined.

- [ ] **Step 12: Run chat tests, typecheck and build.**

Run:

```bash
npm run test --workspace apps/chat
npm run typecheck --workspace apps/chat
npm run build --workspace apps/chat
```

Expected: PASS.

- [ ] **Step 13: Run `npm install` and commit.**

```bash
npm install
git add apps/chat package-lock.json
git commit -m "feat: add spacious own-chat customer app"
```

---

### Task 9: Delete Active Meta Source Code and Add a Regression Guard

**Files:**
- Delete: `apps/api/src/whatsapp/` and all files beneath it
- Delete: `apps/api/src/media/whatsapp-media.ts`
- Delete: `apps/api/src/media/whatsapp-media.test.ts`
- Delete: `apps/api/src/media/project-media-store.ts`
- Delete: `apps/api/src/media/project-media-store.test.ts`
- Create: `scripts/check-no-active-meta.mjs`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Delete: `docs/acceptance/phase-1-whatsapp.md`

**Interfaces:**
- Active code under `apps/`, `packages/`, root runtime config and current acceptance docs must contain no `WHATSAPP_`, `whatsapp`, `graph.facebook.com`, or Meta webhook code.
- Historical `supabase/migrations/` and superseded `docs/superpowers/specs|plans/` are excluded from the scan because they preserve audit history.

- [ ] **Step 1: Write the regression script first and run it to prove RED while Meta code still exists.**

`scripts/check-no-active-meta.mjs` recursively scans:

```js
const roots = ['apps', 'packages', 'README.md'];
const forbidden = [/WHATSAPP_/i, /graph\.facebook\.com/i, /webhooks\/whatsapp/i, /whatsapp_message_id/i];
```

It exits `1` and prints exact offending paths. It ignores `node_modules`, `dist`, and generated coverage.

Run: `node scripts/check-no-active-meta.mjs`

Expected: FAIL before deletion.

- [ ] **Step 2: Delete the Meta/WhatsApp source and tests listed above.** Do not delete historical SQL migration files.

- [ ] **Step 3: Update root scripts.**

```json
"check:no-meta": "node scripts/check-no-active-meta.mjs"
```

- [ ] **Step 4: Add `npm run check:no-meta` to CI after tests and before build.**

- [ ] **Step 5: Rewrite the README customer-channel section.** It must identify `apps/chat` as the customer application and explicitly state that Meta/WhatsApp is not a runtime dependency.

- [ ] **Step 6: Delete the obsolete WhatsApp acceptance document.** Historical specs/plans stay in Git history and are superseded by the own-chat spec/roadmap.

- [ ] **Step 7: Run the source guard and confirm GREEN.**

Run: `npm run check:no-meta`

Expected: PASS.

- [ ] **Step 8: Run API tests to catch deleted-import fallout.**

Run: `npm run test --workspace apps/api && npm run typecheck --workspace apps/api`

Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add -A
git commit -m "chore: retire active Meta integration"
```

---

### Task 10: Phase A Acceptance and Verification

**Files:**
- Create: `docs/acceptance/phase-a-own-chat.md`
- Modify only if a test exposes a defect; do not add Phase B features.

**Interfaces:**
- Acceptance document records exact evidence for the first-party chat foundation.

- [ ] **Step 1: Write the acceptance checklist before the final run.** It must contain these scenarios:

1. API boots with `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CHAT_ORIGIN`, and no Meta variable.
2. New browser session gets HttpOnly `cf_session` cookie and no raw token in JSON.
3. Reload/resume returns the same visitor/conversation.
4. Customer sends text and receives streamed deterministic response.
5. Same `clientMessageId` replay does not create a second customer message or AI reply.
6. History reload reproduces durable thread order.
7. Allowed image upload creates a private `media_assets` row and storage object.
8. Unsupported file type/oversized file is rejected without orphaned storage state.
9. Wrong origin is rejected.
10. Active-source no-Meta scan passes.
11. Chat markup has no permanent navigation/category/hero ecommerce shell.
12. Supabase security advisor has no new security lint.

- [ ] **Step 2: Run the complete repository gate.**

```bash
npm test
npm run typecheck
npm run check:no-meta
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Run the production API smoke test already enforced by CI.**

Expected: compiled `dist/server.js` starts and `/health` responds `200`.

- [ ] **Step 4: Run a transactional Supabase session/message rehearsal.** Use generated random token hash and `ROLLBACK`; create a session through `create_chat_session`, insert one customer text with one `client_message_id`, attempt the same idempotency path again through the application/store test contract, and confirm one durable customer message plus one AI reply. Do not leave test data behind.

- [ ] **Step 5: Run Supabase security advisor.**

Expected: no new security lint caused by Phase A.

- [ ] **Step 6: Verify migration history.**

`Supabase.list_migrations` must show the new `own_chat_foundation` migration after the historical migrations; do not rewrite or remove historical versions.

- [ ] **Step 7: Commit acceptance evidence.**

```bash
git add docs/acceptance/phase-a-own-chat.md
git commit -m "docs: record Phase A own-chat acceptance"
```

- [ ] **Step 8: Open a PR from the Phase A implementation branch to `main` and require green CI before merge.**

## Phase A Definition of Done

Phase A is complete only when a fresh customer browser can start and resume a first-party Caneca Fácil conversation, send an idempotent message, receive a streamed deterministic reply, reload the durable thread, upload a private supported file, and the active application contains no Meta/WhatsApp runtime dependency. The customer shell must visibly preserve the approved spacious conversational rhythm rather than resembling an ecommerce website.
