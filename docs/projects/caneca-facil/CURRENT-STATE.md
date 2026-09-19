# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` was rechecked in this round. The public schema contains the own-chat and creative-domain persistence needed for current Phase B work, including `briefings`; all 13 public tables reported RLS enabled. No database migration is justified by the work completed so far.

## Phase B
In progress. Deterministic briefing merge/correction/readiness/minimum-next-question is implemented and covered. The bounded versioned rich-component protocol is implemented in `packages/core/src/chat-components.ts` and exported by core.

The backend-only typed conversation interpreter boundary at `apps/api/src/ai/conversation-interpreter.ts` now has both deterministic simulation and a production OpenAI adapter. The OpenAI adapter uses backend-only credentials, Responses API structured JSON-schema output, compact recent-message context capped at 12 turns, a cost-conscious default model (`gpt-5-mini`), and explicit instructions forbidding protected business-state decisions. Provider output is parsed and then passed through the same local validation boundary before use. Invalid/empty provider output fails closed.

Latest interpreter commits:
- `57366112` — production OpenAI structured interpreter adapter.
- `fe52436d` — adapter tests for schema, compact context and invalid JSON.

## Next executable work
1. Add a briefing repository/orchestrator that loads current briefing, applies interpreter facts through `mergeBriefing`, evaluates readiness in deterministic code and versions the result.
2. Wire that orchestration into own-chat turns while honoring conversation `automation_mode`.
3. Stream validated components over SSE and persist final assistant structured content.
4. Add same-engine simulation and Phase B acceptance evidence.
5. Run full repository tests/typecheck/build/no-Meta guard after the orchestration block; no live OpenAI call is required for unit coverage.

Do not add schema changes unless a concrete persistence gap is proven.