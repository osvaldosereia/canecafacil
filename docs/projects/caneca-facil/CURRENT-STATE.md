# Caneca Fácil — Current State

Updated: 2026-09-18

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`.
Active implementation branch: `phase-b-conversational-ai`.
Draft PR: `#8` — **do not merge until Phase B acceptance is complete**.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` is `ACTIVE_HEALTHY`.
Existing schema already contains `automation_mode`, message `structured_content`, projects, versioned briefings and private media foundations with RLS enabled.

Round 1 revalidated the existing transactional functions:
- `ensure_chat_briefing_state(uuid)` — atomically creates/repairs the active project plus initial briefing.
- `append_chat_briefing_version(uuid, uuid, integer, jsonb)` — atomically appends the next briefing version with optimistic version checking and advances the project pointer.

No database migration was required.

## Phase B
**Round 1 of the final 9-round plan is implemented.**

Already implemented before Round 1:
- deterministic briefing merge/correction/readiness/minimum-next-question;
- bounded versioned rich-component protocol;
- typed interpreter boundary;
- deterministic interpreter;
- backend-only OpenAI adapter;
- conversation orchestrator with `ai | human | paused` ownership gate.

Round 1 added:
- Supabase `ConversationBriefingStore` backed by the transactional briefing RPCs;
- automatic durable project/briefing state for AI-owned conversations;
- orchestrator wiring into the real `POST /v1/chat/turns` flow;
- no assistant draft/message creation while ownership is `human` or `paused`;
- validated `component` SSE events;
- assistant `structured_content` persistence, including component envelope and deterministic briefing summary;
- replay of persisted components on duplicate browser retries;
- optional production OpenAI runtime config;
- runtime allow-list validation for briefing facts so protected/unknown fields are rejected;
- current cost-sensitive default model set to `gpt-5.6-luna`;
- integration/unit tests for transactional briefing adapter, orchestration SSE and ownership gates.

Functional commits in this round:
- `41a4b692` — wire conversational AI into own-chat turns.
- `1f62a486` — use transactional briefing RPCs.
- `352d7222` — harden conversational AI output contract.

## Verification status
A Draft PR (`#8`) was opened against `main` so the repository CI can validate the branch. At the end of this round GitHub had not yet registered a workflow run for the new PR head. Local execution was not possible in the current runtime because outbound GitHub DNS is unavailable there.

Therefore implementation is complete for Round 1, while the full executable gate belongs to Round 2: tests, typecheck, build, no-Meta guard, multi-turn acceptance and fixes from any CI failures.

## Next executable work — Round 2
1. Inspect PR #8 CI/workflow state and fix every failure.
2. Add same-engine simulator coverage and end-to-end multi-turn briefing scenarios.
3. Verify explicit correction preserves unrelated briefing facts across persisted versions.
4. Verify unsupported rich UI never reaches the customer.
5. Run/confirm full tests, typecheck, build and `check:no-meta`.
6. Record `docs/acceptance/phase-b-conversational-ai.md`.
7. Do not merge PR #8 until Phase B acceptance is green.
