# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Historical only: `osvaldosereia/CHAT`

Then read, in order: `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md` in this directory. Architecture authority remains `docs/superpowers/specs/2026-09-16-caneca-facil-own-chat-redesign.md`; detailed master roadmap remains `docs/superpowers/plans/2026-09-16-caneca-facil-own-chat-roadmap.md`.

## Current checkpoint
Phase A is complete. Phase B — Conversational AI is active. The live Supabase schema already contains versioned briefing persistence and the own-chat foundation. `packages/core/src/briefing.ts` has the basic domain shape but not yet the deterministic Phase B engine.

## Continue autonomously
1. Re-check branch head/recent commits before edits.
2. Implement deterministic briefing merge/correction/readiness/minimum-next-question with tests.
3. Add versioned validated rich-component protocol with tests.
4. Add typed backend-only interpreter/provider contract and deterministic fake for tests.
5. Wire orchestration into own-chat turn flow without bypassing `automation_mode`.
6. Stream validated text/components over SSE and persist final assistant structured content.
7. Add same-engine simulator/test mode and Phase B acceptance evidence.
8. Run tests/typecheck/build/no-Meta guard and Supabase advisors after any DB/security change.
9. Update this handoff and `CURRENT-STATE.md` at the end of each substantial round.

Never reintroduce Meta, WhatsApp or Make runtime code. Do not mix Dona Antônia or any other project.