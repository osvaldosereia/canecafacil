# Phase A — Own Chat Foundation Acceptance

Date: 2026-09-16

## Scope

This acceptance checkpoint covers only the first-party chat foundation. It does not claim conversational AI, product recommendation, artwork generation, checkout, payment or production automation.

## Verified application behavior

- `apps/chat` exists as the customer-facing React/Vite/PWA workspace.
- The initial customer experience is conversation-first, mobile-first and intentionally avoids storefront/navigation chrome.
- Anonymous sessions are issued/resumed through an HttpOnly cookie; only the SHA-256 token hash is persisted.
- Customer messages use provider-neutral contracts and are idempotent by `(conversation_id, client_message_id)`.
- One assistant reply is allowed per customer message.
- Phase A assistant text streams through SSE using `accepted`, `text_delta`, `done` and recoverable `error` events.
- Conversation history is durable and reloadable through the first-party API.
- Images and audio upload directly to the Caneca Fácil backend/private Supabase Storage path; no public source URL is returned.
- Upload MIME and size limits are enforced server-side.
- Active Meta/WhatsApp runtime source has been removed from `apps/` and `packages/`.
- CI contains a regression guard that rejects active Meta/WhatsApp tokens in application source.

## CI evidence

Branch: `feat/caneca-facil-own-chat-foundation`

Commit `5a5f47f0ebb70f1a5a2ccc09da6fbdca9da67fb2` completed the verify job with:

- tests: PASS;
- TypeScript typecheck: PASS;
- `check:no-meta`: PASS;
- build: PASS;
- production API smoke test: PASS.

The final branch head after this document must pass the same complete gate before merge.

## Supabase evidence

Project: `ijquzclfijwfgwupoxmg`

Active Phase A migrations:

- `20260916194249 own_chat_foundation`
- `20260916194413 own_chat_foundation_indexes`

Historical Meta migrations remain in migration history intentionally and are not active API contracts.

Direct schema verification on 2026-09-16 confirmed:

- no active `public.ingest_whatsapp_inbound` function;
- no public-schema column containing `whatsapp`;
- `customer-uploads` exists as a private bucket;
- `service_role` can execute `public.create_chat_session(text,timestamptz)`;
- `anon` and `authenticated` cannot execute that session-creation function;
- all active public domain tables have RLS enabled;
- Supabase security advisor reports zero lints.

The performance advisor reports only `unused_index` informational findings. They are intentionally retained because the database has no representative chat traffic yet.

## Transactional database rehearsal

A transaction was executed against the live schema and rolled back after assertions. The rehearsal proved:

1. `create_chat_session` creates one visitor/session/open conversation identity;
2. replaying the same `client_message_id` produces only one customer message;
3. the partial uniqueness rule permits only one AI reply for the same customer message;
4. all assertions passed;
5. after `ROLLBACK`, persisted verification sessions = `0` and persisted verification messages = `0`.

## Retired artifacts

Removed from active code/documentation during Phase A:

- API Meta/WhatsApp client, webhook, normalization, ingest and outbound modules;
- Meta-specific media downloader;
- obsolete project-media adapter superseded by `media_assets`;
- old Phase 1 WhatsApp acceptance document;
- old Railway/WhatsApp deployment guide;
- root environment examples containing `WHATSAPP_*` credentials.

Historical SQL migrations and superseded Superpowers design/plan documents remain in Git history for traceability.

## Phase A exit condition

Phase A can be merged only after the final branch head passes the full CI gate and the final code review confirms that the diff matches the approved Own Chat Foundation plan.
