# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`. Active implementation branch: `phase-b-conversational-ai`.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` was rechecked in this round with verbose schema inspection. The public schema contains the own-chat and creative-domain persistence needed for current Phase B work: conversations expose `automation_mode`, messages already expose `structured_content`, and versioned `briefings` plus project current-briefing pointers are present. All reported public tables have RLS enabled. No migration is justified yet.

## Phase B
In progress. Deterministic briefing merge/correction/readiness/minimum-next-question, bounded rich components, typed interpreter boundary, deterministic interpreter and production OpenAI structured adapter are implemented.

This round added `ConversationBriefingStore` and `createConversationOrchestrator`. The orchestrator loads conversation/briefing context, refuses to invoke AI when `automation_mode` is `human` or `paused`, sends interpreter facts only through `mergeBriefing` plus deterministic evaluation, versions changed briefings when an active project exists, and appends the deterministic minimum next question when required. Tests cover protected readiness and the human/paused AI gate.

Latest functional commits:
- `c365ef2e` — conversational briefing store contract.
- `ec109a90` — deterministic conversation orchestrator.
- `53c68258` — orchestration gate/readiness tests.

## Next executable work
1. Implement the Supabase `ConversationBriefingStore` adapter against existing conversations/mug_projects/briefings columns; do not add schema unless tests prove a gap.
2. Extend message completion to persist validated assistant `structured_content`.
3. Wire orchestrator into own-chat turns, emitting a bounded SSE component event after validation and honoring `human`/`paused` without creating an AI response.
4. Add same-engine simulation/route coverage and Phase B acceptance evidence.
5. Run full repository tests/typecheck/build/no-Meta guard and Supabase advisors after any DB/security change.
