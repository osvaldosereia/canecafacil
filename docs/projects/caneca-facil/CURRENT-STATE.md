# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` already has the own-chat and creative-domain persistence needed for current Phase B work, including versioned briefings. No database migration is justified by the work completed so far.

## Phase B
In progress. Deterministic briefing merge/correction/readiness/minimum-next-question is implemented and covered. A versioned bounded rich-component protocol is now implemented in `packages/core/src/chat-components.ts` and exported by core. Version 1 currently permits only validated text, quick replies, action buttons, upload requests and notices; arbitrary HTML/unknown component types and unsupported protocol versions are rejected. Counts and text lengths are bounded so an interpreter cannot inject an unrestricted UI tree.

Latest component-protocol commits:
- `131599e9` — protocol implementation.
- `84a31f16` — validation coverage.
- `5bc61890` — public core export.

## Next executable work
Add the backend-only typed conversation interpreter/provider boundary and deterministic fake for tests. Then wire orchestration into the existing own-chat turn/SSE flow, validate all interpreter output through the core protocol, persist final assistant structured content, and add same-engine simulation/Phase B acceptance. Do not add schema changes unless a concrete persistence gap is proven.