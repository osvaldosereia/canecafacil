# Caneca Fácil Phase A — Own Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Meta/WhatsApp runtime with a secure first-party conversational foundation where an anonymous visitor can start, resume and use a spacious mobile-first chat with idempotent messages, SSE streaming and private media uploads.

**Architecture:** The browser talks only to the Caneca Fácil Hono API. The API issues a revocable anonymous session through an HttpOnly cookie, persists provider-neutral conversation/message data in Supabase with the service-role client, streams assistant output over SSE, and owns private media uploads. `apps/chat` is a React/Vite customer surface designed as a calm conversation, not a storefront page. Phase A deliberately uses a deterministic foundation responder so transport, persistence and UX can be proven without OpenAI.

**Tech Stack:** Node 24, TypeScript 5.9.3, Hono 4.13.7, React 19.3.0, React DOM 19.3.0, Vite 8.3.0, Vitest 5.0.0, Supabase JS 2.116.0, Postgres 17, SSE.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`

## Global Constraints

- Meta/WhatsApp must not be required by runtime code, configuration, customer UI or the active database contract.
- Historical migrations stay immutable; active Meta database artifacts are retired through a new forward migration.
- Start implementation from `main`; do not merge `feat/caneca-facil-briefing-simulator` wholesale.
- Customer chat uses generous whitespace, one meaningful decision at a time and no ecommerce-site chrome.
- Customer browser never receives Supabase service-role or provider secrets.
- Customer chat uses the Caneca Fácil API rather than direct Supabase table access.
- Anonymous session credentials live only in an HttpOnly cookie; only a SHA-256 hash is persisted.
- Mutating customer routes require the exact configured `CHAT_ORIGIN` and a valid non-revoked session.
- Message retries are idempotent by `(conversation_id, client_message_id)`.
- Customer and creative media stays private.
- Phase A does not call OpenAI and does not implement product recommendation, art generation, checkout or payment.
- DDL is applied only with `Supabase.apply_migration` and mirrored exactly into `supabase/migrations/`.
- Run Supabase security advisors after schema/security changes.
- Every code task follows RED → minimal GREEN → refactor only while green.
- Final gate requires `npm test`, `npm run typecheck`, `npm run build`, production API smoke, Supabase security review and the no-Meta source scan.

---

### Task 1: Remove Meta From the Runtime Boundary

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

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

- [ ] **Step 1: Write failing config tests.**

```ts
it('loads without Meta configuration', () => {
  expect(loadApiConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_example_only',
    CHAT_ORIGIN: 'http://localhost:5174',
  })).toMatchObject({
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
    SUPABASE_SECRET_KEY: 'sb_secret_example_only',
    CHAT_ORIGIN: 'http://localhost:5174',
    SESSION_TTL_DAYS: '0',
  })).toThrow('SESSION_TTL_DAYS must be an integer between 1 and 365');
});
```

- [ ] **Step 2: Write a failing app test proving Meta webhook registration is gone.**

```ts
it('does not expose the old Meta webhook', async () => {
  const response = await createApiApp({}).request('/webhooks/whatsapp?hub.mode=subscribe');
  expect(response.status).toBe(404);
});
```

- [ ] **Step 3: Run RED.**

Run: `npm run test --workspace apps/api -- config.test.ts app.test.ts`

Expected: FAIL because `WHATSAPP_*` is still required and the webhook is still registered.

- [ ] **Step 4: Implement the provider-neutral config and remove webhook wiring from `app.ts`.**

`loadApiConfig` must read:

```ts
chatOrigin: requireValue(env, 'CHAT_ORIGIN'),
nodeEnv: parseNodeEnv(env.NODE_ENV),
sessionCookieName: optionalValue(env, 'SESSION_COOKIE_NAME') ?? 'cf_session',
sessionTtlDays: parseSessionTtlDays(env.SESSION_TTL_DAYS),
```

Delete every `whatsapp*` property from `ApiConfig`.

- [ ] **Step 5: Replace `apps/api/.env.example`.**

```dotenv
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY=sb_secret_example_only
CHAT_ORIGIN=http://localhost:5174
NODE_ENV=development
SESSION_COOKIE_NAME=cf_session
SESSION_TTL_DAYS=30
PORT=3000
```

- [ ] **Step 6: Run GREEN.**

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
- Create: exact versioned migration file returned after `Supabase.apply_migration(name="own_chat_foundation")`
- Modify: `supabase/schema/initial_caneca_facil.sql`
- Modify: `apps/api/src/ai/transcription.ts`
- Modify: `apps/api/src/ai/transcription.test.ts`

**Interfaces:**
- Creates `chat_visitors` and `chat_sessions`.
- Generalizes `conversations`, `messages` and `mug_projects`.
- Renames `project_media` → `media_assets`.
- Renames `audio_transcriptions.project_media_id` → `media_asset_id`.
- Creates service-role-only `create_chat_session(text,timestamptz)`.
- Removes the exact old RPC `ingest_whatsapp_inbound(text,text,text,text,text,jsonb,timestamptz)`.

- [ ] **Step 1: Reconfirm the tables that will receive destructive column changes are empty.**

Run with `Supabase.execute_sql`:

```sql
select
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.project_media) as project_media;
```

Expected for the current project: `0, 0, 0`. If any value is non-zero, stop this task and replace this plan's destructive section with a data-preserving migration before executing DDL.

- [ ] **Step 2: Apply migration `own_chat_foundation` with this SQL.**

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
on public.chat_visitors for all to service_role using (true) with check (true);

create policy "service role manages chat sessions"
on public.chat_sessions for all to service_role using (true) with check (true);

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

alter table public.audio_transcriptions
  rename column project_media_id to media_asset_id;

alter table public.customers drop column if exists whatsapp_id;

drop function if exists public.ingest_whatsapp_inbound(text,text,text,text,text,jsonb,timestamptz);

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

revoke all on function public.create_chat_session(text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_chat_session(text,timestamptz) to service_role;
```

- [ ] **Step 3: Mirror the exact applied SQL into the exact versioned file reported by `Supabase.list_migrations`.** Do not invent a timestamp.

- [ ] **Step 4: Update transcription persistence code to read/write `media_asset_id`.** Write the failing test before changing `transcription.ts`.

- [ ] **Step 5: Update `supabase/schema/initial_caneca_facil.sql` to the active provider-neutral schema.** Historical migration files remain unchanged.

- [ ] **Step 6: Verify permissions and active contract.**

```sql
select has_table_privilege('anon', 'public.chat_sessions', 'select') as anon_can_select,
       has_table_privilege('authenticated', 'public.chat_sessions', 'select') as auth_can_select,
       has_function_privilege('service_role', 'public.create_chat_session(text,timestamptz)', 'execute') as service_can_create;
```

Expected: `false, false, true`.

- [ ] **Step 7: Run Supabase security advisor and require no new security lint.**

- [ ] **Step 8: Commit.**

```bash
git add supabase/migrations supabase/schema/initial_caneca_facil.sql apps/api/src/ai/transcription.ts apps/api/src/ai/transcription.test.ts
git commit -m "feat: add provider-neutral chat schema"
```

---

### Task 3: Implement Anonymous Session Identity

**Files:**
- Create: `apps/api/src/chat/session-token.ts`
- Create: `apps/api/src/chat/session-token.test.ts`
- Create: `apps/api/src/chat/session-store.ts`
- Create: `apps/api/src/chat/supabase-session-store.ts`
- Create: `apps/api/src/chat/supabase-session-store.test.ts`
- Create: `apps/api/src/chat/session-routes.ts`
- Create: `apps/api/src/chat/session-routes.test.ts`
- Modify: `apps/api/src/app.ts`

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

Routes:

- `POST /v1/chat/session` — create or resume;
- `GET /v1/chat/session` — resolve current session or `401`.

- [ ] **Step 1: Write failing token tests.**

```ts
it('creates URL-safe high-entropy tokens and stable SHA-256 hashes', () => {
  const token = createOpaqueSessionToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(hashSessionToken(token)).toBe(hashSessionToken(token));
});
```

- [ ] **Step 2: Write failing store tests.** Cover atomic RPC creation, expired/revoked resolution returning `null`, and `touch` updating both session and visitor timestamps.

- [ ] **Step 3: Write failing route tests.**

```ts
it('creates an HttpOnly session without returning the raw token', async () => {
  const response = await app.request('/v1/chat/session', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5174' },
  });
  expect(response.status).toBe(201);
  expect(response.headers.get('set-cookie')).toContain('cf_session=');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  await expect(response.json()).resolves.toEqual({
    visitorId: '9d92c8b5-f0f1-4ffd-b2a6-91b28bb04ef3',
    conversationId: '24cfb73e-31d5-45e2-aefa-54d0cc37f978',
  });
});
```

Also test wrong origin → `403`, valid cookie recovery → same identity, expired cookie → `401` on GET and new session on POST.

- [ ] **Step 4: Run RED.**

Run: `npm run test --workspace apps/api -- session-token.test.ts supabase-session-store.test.ts session-routes.test.ts`

Expected: FAIL because the own-chat session modules do not exist.

- [ ] **Step 5: Implement token helpers with Node `crypto`.**

```ts
export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
```

- [ ] **Step 6: Implement `createSupabaseChatSessionStore(client)`.** Creation calls `create_chat_session`; resolution requires `revoked_at IS NULL` and `expires_at > now`; touch updates `chat_sessions.last_seen_at` and `chat_visitors.last_seen_at`.

- [ ] **Step 7: Implement cookie routes.** Cookie attributes: `HttpOnly`, `SameSite=Strict`, `Path=/`, Max-Age = `sessionTtlDays × 86400`, and `Secure` only when `nodeEnv === 'production'`. Never include the raw token in JSON or logs.

- [ ] **Step 8: Run GREEN.**

Run: `npm run test --workspace apps/api -- session-token.test.ts supabase-session-store.test.ts session-routes.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/chat apps/api/src/app.ts
git commit -m "feat: add anonymous own-chat sessions"
```

---

### Task 4: Persist Idempotent Messages and Stream Turns Over SSE

**Files:**
- Create: `packages/core/src/chat.ts`
- Create: `packages/core/src/chat.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/api/src/chat/message-store.ts`
- Create: `apps/api/src/chat/supabase-message-store.ts`
- Create: `apps/api/src/chat/supabase-message-store.test.ts`
- Create: `apps/api/src/chat/responder.ts`
- Create: `apps/api/src/chat/responder.test.ts`
- Create: `apps/api/src/chat/turn-routes.ts`
- Create: `apps/api/src/chat/turn-routes.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.ts`
- Modify: root `package-lock.json` through `npm install`

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

`POST /v1/chat/turns` request:

```json
{
  "clientMessageId": "7c4c0c87-b137-4df4-90d7-f31c88940864",
  "text": "Quero uma caneca para minha esposa"
}
```

SSE contract:

```text
event: accepted
data: {"messageId":"155ee209-51d9-4fe3-bb18-5c6401dd2dbe","accepted":true}

event: text_delta
data: {"delta":"Entendi. "}

event: done
data: {"assistantMessageId":"1837c2b9-7506-4f35-89c6-227715cdad93"}
```

Phase A foundation response:

```text
Entendi. Pode continuar me contando como você imagina sua caneca.
```

- [ ] **Step 1: Write failing core tests.** `normalizeCustomerTextTurn` trims outer whitespace, rejects blank text, caps text at 8,000 UTF-16 code units and requires UUID-shaped `clientMessageId`.

- [ ] **Step 2: Write failing store tests.** Repeating `(conversationId, clientMessageId)` returns the original customer message with `accepted=false`; only one AI draft may use the same customer `replyToMessageId`.

- [ ] **Step 3: Write failing SSE route tests.** Cover missing session `401`, wrong origin `403`, first turn, duplicate retry, streamed deltas, durable completed AI reply, failed stream marking draft `failed`, and `GET /v1/chat/conversation` returning ordered history.

- [ ] **Step 4: Run RED.**

Run: `npm run test --workspace packages/core -- chat.test.ts && npm run test --workspace apps/api -- supabase-message-store.test.ts responder.test.ts turn-routes.test.ts`

Expected: FAIL because the provider-neutral chat domain/store/routes do not exist.

- [ ] **Step 5: Implement the core types and normalization.**

- [ ] **Step 6: Add `"@caneca-facil/core": "0.1.0"` to API dependencies and run `npm install`.**

- [ ] **Step 7: Implement the Supabase message store.** Duplicate customer insert selects the existing row. AI draft uses `reply_to_message_id` uniqueness. Completion updates draft text/state instead of inserting a second AI row.

- [ ] **Step 8: Implement `createFoundationResponder()` with no OpenAI import.** Return the exact Phase A response in short chunks.

- [ ] **Step 9: Implement `POST /v1/chat/turns` with Hono `streamSSE`.** Validate origin/session first, persist customer turn idempotently, create/reuse AI draft, stream text, complete draft, then emit `done`.

- [ ] **Step 10: Implement `GET /v1/chat/conversation` for the current session only.**

- [ ] **Step 11: Run GREEN.**

Run: `npm run test --workspace packages/core -- chat.test.ts && npm run test --workspace apps/api -- supabase-message-store.test.ts responder.test.ts turn-routes.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit.**

```bash
git add packages/core apps/api/package.json apps/api/src/chat apps/api/src/app.ts package-lock.json
git commit -m "feat: persist and stream own-chat turns"
```

---

### Task 5: Replace Meta Media Retrieval With Private Own-Chat Uploads

**Files:**
- Create: `apps/api/src/media/media-store.ts`
- Create: `apps/api/src/media/supabase-media-store.ts`
- Create: `apps/api/src/media/supabase-media-store.test.ts`
- Create: `apps/api/src/media/upload-routes.ts`
- Create: `apps/api/src/media/upload-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**

Allowed MIME types:

```ts
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'] as const;
```

Limits: image 10 MiB; audio 20 MiB. Unsupported MIME → `415`; oversized file → `413`.

Storage path:

```text
own-chat/{visitorId}/{conversationId}/{mediaId}/{sanitizedFilename}
```

Safe response example:

```json
{
  "id": "6f61f4dc-bd18-4d5d-9d29-836dd05524d2",
  "mediaType": "image",
  "mimeType": "image/jpeg",
  "originalFilename": "referencia.jpg",
  "sizeBytes": 123456
}
```

- [ ] **Step 1: Write failing store tests.** Prove bucket `customer-uploads`, exact own-chat path, `media_assets.conversation_id`, and absence of public URL generation.

- [ ] **Step 2: Write failing route tests.** Cover session/origin protection, image/audio success, MIME rejection, size rejection and filename sanitization.

- [ ] **Step 3: Run RED.**

Run: `npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts`

Expected: FAIL because own-chat upload modules do not exist.

- [ ] **Step 4: Implement server-controlled multipart upload.** Upload to private `customer-uploads`, then insert `media_assets`. If DB insert fails after storage succeeds, remove the just-uploaded object before returning failure.

- [ ] **Step 5: Run GREEN.**

Run: `npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/media apps/api/src/app.ts
git commit -m "feat: add private own-chat media uploads"
```

---

### Task 6: Build the Human, Spacious `apps/chat` Shell

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
- Modify: root `package-lock.json` through `npm install`

**Interfaces:**
- `VITE_API_URL=http://localhost:3000`
- Boot: `POST /v1/chat/session` with `credentials:'include'`, then `GET /v1/chat/conversation`.
- Send: UUID `clientMessageId` to `/v1/chat/turns`, parse SSE via `fetch` streaming.
- Upload: multipart `/v1/chat/media` with credentials.

**Mandatory visual constants:**

```css
:root {
  --chat-max-width: 720px;
  --chat-turn-gap: 32px;
  --chat-inline-gap: 12px;
  --chat-page-padding: clamp(20px, 5vw, 48px);
  --chat-radius: 22px;
}

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

No permanent `<nav>`, sidebar, category grid, hero banner, catalog footer or ecommerce header.

- [ ] **Step 1: Create `apps/chat/package.json` using repository versions.**

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

- [ ] **Step 2: Write failing SSE parser and API-client tests.** Cover split chunks, multiple events/chunk, UTF-8, credentials include, session bootstrap, history, turn streaming and upload.

- [ ] **Step 3: Write the failing visual-shell test.**

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

- [ ] **Step 4: Run RED.**

Run: `npm run test --workspace apps/chat`

Expected: FAIL because the chat shell/client is incomplete.

- [ ] **Step 5: Implement SSE parser and API client without a third-party state manager.**

- [ ] **Step 6: Implement the conversational shell with this initial copy.**

```text
Oi! 👋
Vamos criar uma caneca do seu jeito?

Me conta o que você imagina. Se preferir, pode mandar uma foto ou áudio também.
```

Composer placeholder: `Me conta o que você imagina...`

Customer messages may use a subtle compact right-aligned bubble. AI messages use open typography/whitespace rather than putting every response inside a box.

- [ ] **Step 7: Implement optimistic customer turns with retry.** A failed send preserves the drafted text and shows retry; it never silently discards the customer's content.

- [ ] **Step 8: Implement streaming assistant text and attachment upload status.** Phase A supports selecting existing image/audio files. Browser audio recording is outside Phase A because microphone lifecycle/permissions are not needed to validate the transport foundation.

- [ ] **Step 9: Add `manifest.webmanifest` with name `Caneca Fácil`, display `standalone`, start URL `/`.** Do not add a service worker in Phase A because offline message replay semantics are not part of this phase.

- [ ] **Step 10: Run GREEN and build.**

```bash
npm run test --workspace apps/chat
npm run typecheck --workspace apps/chat
npm run build --workspace apps/chat
npm install
```

Expected: PASS.

- [ ] **Step 11: Commit.**

```bash
git add apps/chat package-lock.json
git commit -m "feat: add spacious own-chat customer app"
```

---

### Task 7: Delete Active Meta Source Code and Enforce No Regression

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
- Active source under `apps/`, `packages/`, runtime config and `README.md` must contain no `WHATSAPP_`, `graph.facebook.com`, `/webhooks/whatsapp` or `whatsapp_message_id`.
- Historical `supabase/migrations/` and superseded design/plan documents remain untouched for audit history.

- [ ] **Step 1: Create the source guard before deleting Meta code.**

```js
const roots = ['apps', 'packages', 'README.md'];
const forbidden = [
  /WHATSAPP_/i,
  /graph\.facebook\.com/i,
  /webhooks\/whatsapp/i,
  /whatsapp_message_id/i,
];
```

The script recursively scans the roots, ignores `node_modules`, `dist` and coverage output, prints every offending path and exits `1` if any match exists.

- [ ] **Step 2: Run RED.**

Run: `node scripts/check-no-active-meta.mjs`

Expected: FAIL while old source still exists.

- [ ] **Step 3: Delete the Meta-specific source/tests listed above.** Never delete historical SQL migrations.

- [ ] **Step 4: Add root script.**

```json
"check:no-meta": "node scripts/check-no-active-meta.mjs"
```

- [ ] **Step 5: Add `npm run check:no-meta` to CI after tests and before build.**

- [ ] **Step 6: Rewrite README runtime architecture around `apps/chat` and explicitly state that Meta/WhatsApp is not a runtime dependency.**

- [ ] **Step 7: Delete the obsolete WhatsApp acceptance document.**

- [ ] **Step 8: Run GREEN.**

```bash
npm run check:no-meta
npm run test --workspace apps/api
npm run typecheck --workspace apps/api
```

Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add -A
git commit -m "chore: retire active Meta integration"
```

---

### Task 8: Phase A Acceptance and Verification

**Files:**
- Create: `docs/acceptance/phase-a-own-chat.md`

- [ ] **Step 1: Write the acceptance checklist before final verification.** It must record evidence for:

1. API boots with Supabase + `CHAT_ORIGIN` and no Meta variable.
2. New browser gets HttpOnly `cf_session`; raw token never appears in JSON.
3. Reload resumes the same visitor/conversation.
4. Text turn receives streamed deterministic response.
5. Same `clientMessageId` does not create a second customer message or AI reply.
6. History reload returns durable chronological thread.
7. Allowed private image/audio upload creates `media_assets` + private storage object.
8. Unsupported/oversized upload leaves no orphaned storage object.
9. Wrong origin is rejected.
10. `npm run check:no-meta` passes.
11. Customer markup has no permanent nav/category/hero ecommerce shell.
12. Supabase advisor has no new security lint.

- [ ] **Step 2: Run the complete repository gate.**

```bash
npm test
npm run typecheck
npm run check:no-meta
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Run the production API smoke test enforced by CI.** Compiled `dist/server.js` must start and `/health` must return `200`.

- [ ] **Step 4: Run a transactional Supabase rehearsal with `ROLLBACK`.** Create one anonymous session through `create_chat_session`, exercise one idempotent customer message through the application/store test contract, verify one customer message + one AI reply, and leave no test rows committed.

- [ ] **Step 5: Run Supabase security advisor.** Expected: no new Phase A security lint.

- [ ] **Step 6: Verify migration history.** `Supabase.list_migrations` must show `own_chat_foundation` after historical migrations; historical versions remain intact.

- [ ] **Step 7: Commit acceptance evidence.**

```bash
git add docs/acceptance/phase-a-own-chat.md
git commit -m "docs: record Phase A own-chat acceptance"
```

- [ ] **Step 8: Open a PR to `main` and require green CI before merge.**

## Phase A Definition of Done

Phase A is complete only when a fresh customer browser can start and resume a first-party Caneca Fácil conversation, send an idempotent message, receive a streamed deterministic reply, reload the durable thread, upload a private supported file, and the active application contains no Meta/WhatsApp runtime dependency. The customer shell must visibly preserve the approved spacious conversational rhythm rather than resembling an ecommerce website.
