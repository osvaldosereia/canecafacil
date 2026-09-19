# Caneca Fácil — Current State

Updated: 2026-09-19

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`.
Active implementation branch: `phase-b-conversational-ai`.
Draft PR: `#8` — do not merge until Phase B acceptance is green.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` is `ACTIVE_HEALTHY`. Existing schema contains `automation_mode`, message `structured_content`, projects, versioned briefings and private media foundations with RLS enabled. Transactional briefing RPCs remain sufficient; no Round 2 migration was required.

## Phase B
Round 1 implementation is complete: Supabase briefing adapter, real turn orchestration, structured assistant content, validated component SSE, retry replay, OpenAI backend adapter and ownership gates.

Round 2 is in final CI verification. A same-engine multi-turn acceptance test now covers progressive fact collection, deterministic readiness and targeted color correction while preserving recipient, occasion, theme and style. Acceptance criteria are recorded in `docs/acceptance/phase-b-conversational-ai.md`.

CI evidence so far: repository tests, typecheck and `check:no-meta` are green. Production API build exposed a NodeNext-only workspace package resolution problem. Cleaning generated declarations alone did not fix it. The core package now exposes workspace types from source and its public barrel uses NodeNext-compatible explicit `.js` specifiers. A fresh CI run after these fixes is the remaining Phase B gate.

Round 2 commits include:
- `c55e2f70` — clean core declarations before build;
- `42a0cea2` — resolve core workspace types from source;
- `54dc42b1` — multi-turn Phase B acceptance scenario;
- `6835571a` — NodeNext-compatible core exports;
- `ec8a122e` — Phase B acceptance document.

## Next executable work
1. Require a fully green PR #8 CI including production build and API smoke.
2. Fix any residual build/runtime issue without weakening the type/validation boundaries.
3. Mark Phase B accepted and update acceptance evidence.
4. Start Round 3 immediately: server-authoritative Intelligent Storefront domain and APIs.
