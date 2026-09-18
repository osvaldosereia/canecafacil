# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`. Architecture authority remains the own-chat redesign spec and master roadmap.

## Current checkpoint
Phase A is complete. Phase B — Conversational AI is active. Deterministic briefing merge/correction/readiness/minimum-next-question is implemented. The versioned validated rich-component protocol is also implemented and exported from `@caneca-facil/core`; latest functional protocol commits are `131599e9`, `84a31f16`, `5bc61890`.

## Continue autonomously
1. Re-check branch head/recent commits before edits.
2. Add typed backend-only conversation interpreter/provider contract plus deterministic fake and tests.
3. Feed interpreter facts through deterministic briefing merge/readiness rather than allowing direct protected-state mutation.
4. Wire orchestration into own-chat turn flow without bypassing `automation_mode`.
5. Validate every rich component through `validateChatComponentEnvelope`, stream components over SSE, and persist final assistant structured content.
6. Add same-engine simulator/test mode and Phase B acceptance evidence.
7. Run tests/typecheck/build/no-Meta guard; run Supabase advisors after any DB/security change.
8. Update this handoff and `CURRENT-STATE.md` after each substantial round.

No DB migration is currently needed. Never reintroduce Meta, WhatsApp or Make runtime code. Do not mix Dona Antônia or any other project.