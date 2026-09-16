# Caneca Fácil Phase A — Own Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Meta/WhatsApp runtime with a secure first-party conversational foundation where an anonymous visitor can start, resume and use a spacious mobile-first chat with idempotent messages, SSE streaming and private media uploads.

**Architecture:** The browser talks only to the Caneca Fácil Hono API. The API issues a revocable anonymous session through an HttpOnly cookie, persists provider-neutral conversation/message data in Supabase with the service-role client, streams assistant output over SSE, and owns private media uploads. `apps/chat` is a React/Vite customer surface designed as a calm conversation, not a storefront page. Phase A uses a deterministic foundation responder so transport, persistence and UX can be proven without OpenAI.

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
```

Also test `SESSION_TTL_DAYS=0` → `SESSION_TTL_DAYS must be an integer between 1 and 365`.

- [ ] **Step 2: Write a failing app test proving the old route is absent.**

```ts
it('does not expose the old Meta webhook', async () => {
  const response = await createApiApp({}).request('/webhooks/whatsapp?hub.mode=subscribe');
  expect(response.status).toBe(404);
});
```

- [ ] **Step 3: Run RED.**

Run: `npm run test --workspace apps/api -- config.test.ts app.test.ts`

Expected: FAIL because `WHATSAPP_*` is still required and webhook wiring still exists.

- [ ] **Step 4: Implement the interface above, remove all `whatsapp*` config properties, remove webhook imports/registration, and replace `.env.example` with:**

```dotenv
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY=sb_secret_example_only
CHAT_ORIGIN=http://localhost:5174
NODE_ENV=development
SESSION_COOKIE_NAME=cf_session
SESSION_TTL_DAYS=30
PORT=3000
```

- [ ] **Step 5: Run GREEN and commit.**

```bash
npm run test --workspace apps/api -- config.test.ts app.test.ts
git add apps/api
git commit -m "refactor: remove Meta runtime dependency"
```

---

### Task 2: Migrate Supabase to a Provider-Neutral Chat Schema

**Files:**
- Create: exact migration filename reported after `Supabase.apply_migration(name="own_chat_foundation")`
- Modify: `supabase/schema/initial_caneca_facil.sql`
- Modify: `apps/api/src/ai/transcription.ts`
- Modify: `apps/api/src/ai/transcription.test.ts`

**Interfaces:**
- Creates `chat_visitors`, `chat_sessions`.
- Generalizes `conversations`, `messages`, `mug_projects`.
- Renames `project_media` → `media_assets` and `audio_transcriptions.project_media_id` → `media_asset_id`.
- Creates service-role-only `create_chat_session(text,timestamptz)`.
- Removes exact old RPC `ingest_whatsapp_inbound(text,text,text,text,text,jsonb,timestamptz)`.

- [ ] **Step 1: Reconfirm destructive tables are empty.**

```sql
select
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.project_media) as project_media;
```

Expected now: `0, 0, 0`. If any count is non-zero, stop this task and replace the destructive section with a data-preserving migration before applying DDL.

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
on public.conversations(visitor_id) where status = 'open';

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
alter table public.audio_transcriptions rename column project_media_id to media_asset_id;

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
  insert into public.chat_visitors default values returning id into v_visitor_id;
  insert into public.chat_sessions(visitor_id, token_hash, expires_at)
  values (v_visitor_id, p_token_hash, p_expires_at) returning id into v_session_id;
  insert into public.conversations(visitor_id, customer_id, status, automation_mode)
  values (v_visitor_id, null, 'open', 'ai') returning id into v_conversation_id;
  return query select v_session_id, v_visitor_id, v_conversation_id;
end;
$$;

revoke all on function public.create_chat_session(text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_chat_session(text,timestamptz) to service_role;
```

- [ ] **Step 3: Mirror the exact applied SQL into the exact versioned migration filename returned by Supabase.** Do not invent a migration timestamp.

- [ ] **Step 4: Write a failing transcription-store test for `media_asset_id`, then update `transcription.ts` to the renamed column.**

- [ ] **Step 5: Update `supabase/schema/initial_caneca_facil.sql` to the active provider-neutral snapshot.** Historical migrations remain unchanged.

- [ ] **Step 6: Verify permissions.**

```sql
select has_table_privilege('anon', 'public.chat_sessions', 'select') as anon_can_select,
       has_table_privilege('authenticated', 'public.chat_sessions', 'select') as auth_can_select,
       has_function_privilege('service_role', 'public.create_chat_session(text,timestamptz)', 'execute') as service_can_create;
```

Expected: `false, false, true`.

- [ ] **Step 7: Run Supabase security advisor; require no new security lint.**

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
```

Routes: `POST /v1/chat/session` creates/resumes; `GET /v1/chat/session` resolves or returns `401`.

- [ ] **Step 1: Write failing token/store/route tests.** Token must be URL-safe with at least 32 random bytes and SHA-256 hash; store rejects expired/revoked rows; route requires exact origin and emits HttpOnly cookie.

```ts
it('creates an HttpOnly session without returning the raw token', async () => {
  const response = await app.request('/v1/chat/session', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5174' },
  });
  expect(response.status).toBe(201);
  expect(response.headers.get('set-cookie')).toContain('cf_session=');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
});
```

- [ ] **Step 2: Run RED.**

Run: `npm run test --workspace apps/api -- session-token.test.ts supabase-session-store.test.ts session-routes.test.ts`

- [ ] **Step 3: Implement token helpers.**

```ts
export function createOpaqueSessionToken() {
  return randomBytes(32).toString('base64url');
}
export function hashSessionToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
```

- [ ] **Step 4: Implement `createSupabaseChatSessionStore(client)`.** Creation calls `create_chat_session`; resolution requires `revoked_at IS NULL` and `expires_at > now`; touch updates session and visitor last-seen timestamps.

- [ ] **Step 5: Implement cookie routes.** Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/`, Max-Age=`sessionTtlDays × 86400`, `Secure` only in production. Never return/log raw token.

- [ ] **Step 6: Run GREEN and commit.**

```bash
npm run test --workspace apps/api -- session-token.test.ts supabase-session-store.test.ts session-routes.test.ts
git add apps/api/src/chat apps/api/src/app.ts
git commit -m "feat: add anonymous own-chat sessions"
```

---

### Task 4: Publish Shared Chat Types, Persist Idempotently and Stream SSE

**Files:**
- Create: `packages/core/src/chat.ts`
- Create: `packages/core/src/chat.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: root `package.json`
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
```

`POST /v1/chat/turns` accepts:

```json
{"clientMessageId":"7c4c0c87-b137-4df4-90d7-f31c88940864","text":"Quero uma caneca para minha esposa"}
```

SSE emits:

```text
event: accepted
data: {"messageId":"155ee209-51d9-4fe3-bb18-5c6401dd2dbe","accepted":true}

event: text_delta
data: {"delta":"Entendi. "}

event: done
data: {"assistantMessageId":"1837c2b9-7506-4f35-89c6-227715cdad93"}
```

Foundation response: `Entendi. Pode continuar me contando como você imagina sua caneca.`

- [ ] **Step 1: Write failing core normalization tests.** Trim outer whitespace; reject blank; max 8,000 UTF-16 code units; UUID-shaped `clientMessageId` required.

- [ ] **Step 2: Write failing store tests.** Repeating `(conversationId, clientMessageId)` returns the original customer message with `accepted=false`; one AI draft per customer `replyToMessageId`.

- [ ] **Step 3: Write failing SSE tests.** Missing session `401`, wrong origin `403`, first turn, duplicate retry, streamed deltas, completed durable AI reply, failed stream state, ordered history.

- [ ] **Step 4: Run RED.**

```bash
npm run test --workspace packages/core -- chat.test.ts
npm run test --workspace apps/api -- supabase-message-store.test.ts responder.test.ts turn-routes.test.ts
```

- [ ] **Step 5: Publish `@caneca-facil/core` internally.** `packages/core/package.json` must add:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

Change root scripts so core builds before consumers:

```json
{
  "build:core": "npm run build --workspace @caneca-facil/core",
  "test": "npm run build:core && npm run test --workspaces --if-present",
  "typecheck": "npm run build:core && npm run typecheck --workspaces --if-present",
  "build": "npm run build:core && npm run build --workspace @caneca-facil/admin && npm run build --workspace @caneca-facil/api"
}
```

Add `"@caneca-facil/core": "0.1.0"` to API dependencies, then run `npm install`.

- [ ] **Step 6: Implement chat types/normalization, Supabase message store and deterministic responder.** Duplicate customer insert selects existing row; assistant uses one draft row and updates it to completed.

- [ ] **Step 7: Implement `POST /v1/chat/turns` with Hono `streamSSE` and `GET /v1/chat/conversation`.** Validate origin/session before persistence.

- [ ] **Step 8: Run GREEN and commit.**

```bash
npm test
npm run typecheck
npm run build
git add packages/core apps/api package.json package-lock.json
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
- Images: JPEG/PNG/WebP, max 10 MiB.
- Audio: WebM/MPEG/MP4/Ogg/WAV, max 20 MiB.
- Unsupported → `415`; oversized → `413`.
- Path: `own-chat/{visitorId}/{conversationId}/{mediaId}/{sanitizedFilename}`.
- Response never contains a permanent public URL.

- [ ] **Step 1: Write failing store/route tests.** Prove private `customer-uploads`, correct `media_assets.conversation_id`, allowed uploads, MIME/size rejection and cleanup after DB failure.

- [ ] **Step 2: Run RED.**

Run: `npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts`

- [ ] **Step 3: Implement server-controlled multipart upload.** Upload bytes, then insert `media_assets`; remove the object if DB insert fails.

- [ ] **Step 4: Run GREEN and commit.**

```bash
npm run test --workspace apps/api -- supabase-media-store.test.ts upload-routes.test.ts
git add apps/api/src/media apps/api/src/app.ts
git commit -m "feat: add private own-chat media uploads"
```

---

### Task 6: Build the Human, Spacious `apps/chat` Shell

**Files:**
- Create: `apps/chat/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`
- Create: `apps/chat/src/main.tsx`, `App.tsx`, `App.test.tsx`, `styles.css`
- Create: `apps/chat/src/components/ChatShell.tsx`, `ConversationMessage.tsx`, `Composer.tsx`
- Create: `apps/chat/src/lib/chat-api.ts`, `chat-api.test.ts`, `sse.ts`, `sse.test.ts`
- Create: `apps/chat/public/manifest.webmanifest`
- Modify: root `package.json`
- Modify: root `package-lock.json`

**Interfaces:**
- `VITE_API_URL=http://localhost:3000`
- Boot: `POST /v1/chat/session`, then `GET /v1/chat/conversation`, both with `credentials:'include'`.
- Send: UUID `clientMessageId` to `/v1/chat/turns`, parse streaming fetch.
- Upload: multipart `/v1/chat/media` with credentials.

Mandatory visual constants:

```css
:root {
  --chat-max-width: 720px;
  --chat-turn-gap: 32px;
  --chat-inline-gap: 12px;
  --chat-page-padding: clamp(20px, 5vw, 48px);
  --chat-radius: 22px;
}
```

No permanent nav, sidebar, category wall, hero banner, catalog footer or ecommerce header.

- [ ] **Step 1: Scaffold package using React `19.3.0`, React DOM `19.3.0`, Vite `8.3.0`, plugin-react `6.1.1`, matching Admin versions.**

- [ ] **Step 2: Write failing SSE/client tests.** Cover split chunks, multiple events/chunk, UTF-8, credentials, session/history, stream and upload.

- [ ] **Step 3: Write failing visual test.**

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

- [ ] **Step 4: Run RED.** `npm run test --workspace apps/chat`.

- [ ] **Step 5: Implement parser/client and conversational shell.** Initial copy:

```text
Oi! 👋
Vamos criar uma caneca do seu jeito?

Me conta o que você imagina. Se preferir, pode mandar uma foto ou áudio também.
```

Composer: `Me conta o que você imagina...`. Customer messages may use a subtle compact right bubble; AI messages use open typography/whitespace.

- [ ] **Step 6: Implement optimistic send with retry, streaming text and file selection/upload.** A failed send preserves the customer's text. Browser audio recording is not in Phase A; selecting an existing audio file is sufficient for the upload foundation.

- [ ] **Step 7: Add `manifest.webmanifest` with `Caneca Fácil`, `display: standalone`, `start_url: /`.** Do not add a service worker because offline replay semantics are outside Phase A.

- [ ] **Step 8: Update root build order to include chat after core:**

```json
"build": "npm run build:core && npm run build --workspace @caneca-facil/admin && npm run build --workspace @caneca-facil/api && npm run build --workspace @caneca-facil/chat"
```

Run `npm install`.

- [ ] **Step 9: Run GREEN and commit.**

```bash
npm run test --workspace apps/chat
npm run typecheck --workspace apps/chat
npm run build --workspace apps/chat
git add apps/chat package.json package-lock.json
git commit -m "feat: add spacious own-chat customer app"
```

---

### Task 7: Delete Active Meta Source and Enforce No Regression

**Files:**
- Delete: `apps/api/src/whatsapp/` and all files beneath it
- Delete: `apps/api/src/media/whatsapp-media.ts`, `whatsapp-media.test.ts`
- Delete: `apps/api/src/media/project-media-store.ts`, `project-media-store.test.ts`
- Create: `scripts/check-no-active-meta.mjs`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Delete: `docs/acceptance/phase-1-whatsapp.md`

**Interfaces:** Active source under `apps/`, `packages/`, runtime config and `README.md` must contain no `WHATSAPP_`, `graph.facebook.com`, `/webhooks/whatsapp` or `whatsapp_message_id`. Historical migrations and superseded design/plan docs are excluded from the scan.

- [ ] **Step 1: Create regression scan and run RED while old code still exists.**

```js
const roots = ['apps', 'packages', 'README.md'];
const forbidden = [/WHATSAPP_/i, /graph\.facebook\.com/i, /webhooks\/whatsapp/i, /whatsapp_message_id/i];
```

Run: `node scripts/check-no-active-meta.mjs`; Expected: FAIL.

- [ ] **Step 2: Delete listed Meta files, add root `"check:no-meta": "node scripts/check-no-active-meta.mjs"`, add the check to CI after tests, and rewrite README around `apps/chat`.** Never delete historical SQL migrations.

- [ ] **Step 3: Run GREEN.**

```bash
npm run check:no-meta
npm test
npm run typecheck
npm run build
```

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "chore: retire active Meta integration"
```

---

### Task 8: Phase A Acceptance and Verification

**Files:**
- Create: `docs/acceptance/phase-a-own-chat.md`

- [ ] **Step 1: Record evidence for all twelve acceptance scenarios:** API without Meta; HttpOnly session; resume; streamed turn; duplicate retry; durable history; private image/audio upload; upload failure cleanup; wrong-origin rejection; no-Meta scan; no ecommerce shell; no new Supabase security lint.

- [ ] **Step 2: Run full gate.**

```bash
npm test
npm run typecheck
npm run check:no-meta
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Run production API smoke.** Compiled `dist/server.js` starts and `/health` returns `200`.

- [ ] **Step 4: Run a transactional Supabase rehearsal with `ROLLBACK`.** Create an anonymous session with `create_chat_session`, exercise the application/store idempotency contract, confirm one customer message + one AI reply, and leave no test rows committed.

- [ ] **Step 5: Run Supabase security advisor and migration-history check.** `own_chat_foundation` must follow historical migrations; historical versions remain intact.

- [ ] **Step 6: Commit acceptance evidence and open PR to `main`; require green CI before merge.**

```bash
git add docs/acceptance/phase-a-own-chat.md
git commit -m "docs: record Phase A own-chat acceptance"
```

## Phase A Definition of Done

A fresh browser can start and resume a first-party Caneca Fácil conversation, send an idempotent message, receive a streamed deterministic reply, reload durable history, upload a private supported file, and the active application contains no Meta/WhatsApp runtime dependency. The customer shell visibly preserves the approved spacious conversational rhythm rather than resembling an ecommerce website.
