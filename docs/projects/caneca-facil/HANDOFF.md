# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Historical only: `osvaldosereia/CHAT`

Then read, in order: `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md` in this directory. Architecture authority remains `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`; detailed master roadmap remains `docs/superpowers/plans/2026-09-16-caneca-facil-own-chat-roadmap.md`.

## Current checkpoint
Phase A is complete. Phase B — Conversational AI is active. Deterministic briefing merge/correction/readiness/minimum-next-question is now implemented in `packages/core/src/briefing.ts`, with tests in `briefing.test.ts`. Latest functional commits: `886173bf` and `7084d0a7`.

## Continue autonomously
1. Re-check branch head/recent commits before edits.
2. Add versioned validated rich-component protocol with tests.
3. Add typed backend-only interpreter/provider contract and deterministic fake for tests.
4. Wire orchestration into own-chat turn flow without bypassing `automation_mode`.
5. Stream validated text/components over SSE and persist final assistant structured content.
6. Add same-engine simulator/test mode and Phase B acceptance evidence.
7. Run tests/typecheck/build/no-Meta guard; run Supabase advisors after DB/security changes.
8. Update this handoff and `CURRENT-STATE.md` at the end of each substantial round.

No DB migration is needed for the current deterministic core. Never reintroduce Meta, WhatsApp or Make runtime code. Do not mix Dona Antônia or any other project.