# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Draft PR: `#8` — do not merge until Phase B is accepted.
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`. Architecture authority remains the own-chat redesign spec and master roadmap.

## Current checkpoint
Phase A is complete.

**Final autonomous plan: Round 1 completed; Round 2 is next.**

Round 1 integrated the existing Phase B intelligence into the actual own-chat turn path:
- Supabase `ConversationBriefingStore` now uses `ensure_chat_briefing_state` and `append_chat_briefing_version`;
- AI conversations get durable project + initial briefing state automatically;
- the conversational orchestrator is wired into `POST /v1/chat/turns`;
- `human` and `paused` ownership never creates an AI assistant draft;
- validated components emit as bounded SSE `component` events;
- assistant `structured_content` persists component envelope plus deterministic briefing summary;
- duplicate retry can replay completed text/components without invoking the orchestrator again;
- OpenAI runtime config is backend-only and optional;
- provider facts are runtime allow-listed and protected/unknown briefing fields are rejected;
- default cost-sensitive conversation model is `gpt-5.6-luna`.

Round 1 functional commits:
`41a4b692`, `1f62a486`, `352d7222`.

Supabase was inspected directly. No migration was needed. Existing transactional briefing RPCs are the authoritative persistence path.

## Verification note
Draft PR #8 was opened to trigger CI. At the end of Round 1 no workflow run had appeared yet. The current execution environment could not clone GitHub directly because outbound DNS was unavailable, so executable full-gate verification must be the first action in Round 2.

## Continue autonomously — Round 2
1. Re-check branch HEAD and PR #8 before editing.
2. Inspect any CI results; fix failures before expanding scope.
3. Build a same-engine simulator/test path rather than a parallel fake business engine.
4. Add multi-turn persisted briefing tests: initial facts, follow-up facts, targeted correction, readiness.
5. Prove `human | paused` prevents AI generation and unsupported UI is rejected.
6. Confirm full repository tests/typecheck/build/`check:no-meta` and production API smoke.
7. Add Phase B acceptance documentation and update this handoff/current state.
8. If Round 2 finishes early, start Round 3 (Intelligent Storefront backend).

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
