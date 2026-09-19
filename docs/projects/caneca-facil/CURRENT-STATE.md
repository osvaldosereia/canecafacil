# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` already has the own-chat and creative-domain persistence needed for current Phase B work, including versioned briefings. No database migration is justified by the work completed so far.

## Phase B
In progress. Deterministic briefing merge/correction/readiness/minimum-next-question is implemented and covered. The bounded versioned rich-component protocol is implemented in `packages/core/src/chat-components.ts` and exported by core.

A backend-only typed conversation interpreter boundary now exists at `apps/api/src/ai/conversation-interpreter.ts`. It returns only conversational reply text, a `BriefingPatch` of interpreted facts, and optional bounded rich components. Provider output is validated before use; arbitrary UI is rejected. A deterministic interpreter is included for tests/simulation so orchestration does not require live OpenAI calls.

Latest interpreter commits:
- `b16c9d95` — typed interpreter/provider boundary and deterministic implementation.
- `2e20b35f` — validation and safety tests.

## Next executable work
1. Add the production OpenAI interpreter adapter behind this interface with compact structured output and backend-only credentials.
2. Add a briefing repository/orchestrator that loads current briefing, applies interpreter facts through `mergeBriefing`, evaluates readiness in deterministic code and versions the result.
3. Wire that orchestration into own-chat turns while honoring conversation `automation_mode`.
4. Stream validated components over SSE and persist final assistant structured content.
5. Add same-engine simulation and Phase B acceptance evidence.

Do not add schema changes unless a concrete persistence gap is proven.