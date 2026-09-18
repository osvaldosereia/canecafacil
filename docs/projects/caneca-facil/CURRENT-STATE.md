# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Base verified at `db92bf43d74235cdaca9d8794ad188c6ad871efe` (`feat: Fase A do chat próprio da Caneca Fácil`). Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase live verification
Project `ijquzclfijwfgwupoxmg` is active. Public tables have RLS enabled. Own-chat tables include `chat_visitors`, `chat_sessions`, `conversations`, `messages`, `media_assets`; creative-domain tables include `mug_projects`, `briefings`, `art_versions`, `mockup_versions`, `review_events`. `briefings` already supports version, creation mode, occasion, recipient, theme/style, color/text/name/date/element arrays, references, composition/creative direction, missing information, confidence, readiness and `creative_freedom`.

## Phase B
Started. Canonical documentation has been established. Existing `packages/core/src/briefing.ts` currently provides the basic briefing data contract only; deterministic merge/correction/readiness/next-question behavior remains to be implemented with tests. The roadmap calls for a backend-only structured interpreter, validated rich-component protocol, orchestration, SSE integration and simulator mode.

## Next executable work
Implement Phase B deterministic core first, then typed component protocol and provider boundary. Avoid schema changes until application contracts demonstrate a concrete missing persistence requirement.