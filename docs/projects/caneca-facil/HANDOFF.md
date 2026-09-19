# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`. Architecture authority remains the own-chat redesign spec and master roadmap.

## Current checkpoint
Phase A is complete. Phase B — Conversational AI is active. Deterministic briefing merge/correction/readiness/minimum-next-question and the bounded rich-component protocol are implemented. The typed backend-only conversation interpreter boundary is implemented in `apps/api/src/ai/conversation-interpreter.ts`, with deterministic fake/simulation behavior plus a production OpenAI Responses API adapter using strict structured output and compact context. Functional OpenAI adapter commits: `57366112`, `fe52436d`.

Supabase was rechecked after the adapter work: current public persistence remains sufficient, including versioned `briefings`, and all reported public tables have RLS enabled. No migration is currently needed.

## Continue autonomously
1. Re-check branch head/recent commits before edits.
2. Add/load current briefing persistence and an orchestrator that feeds interpreter `facts` only through deterministic `mergeBriefing`/readiness logic; AI must not directly set protected readiness/state.
3. Wire orchestration into own-chat turn flow without bypassing conversation `automation_mode` (`ai | human | paused`).
4. Validate every rich component through `validateChatComponentEnvelope`, stream components over SSE, and persist final assistant structured content.
5. Add same-engine simulator/test mode and Phase B acceptance evidence.
6. Run tests/typecheck/build/no-Meta guard; run Supabase advisors after any DB/security change.
7. Update this handoff and `CURRENT-STATE.md` after each substantial round.

No DB migration is currently needed. Never reintroduce Meta, WhatsApp or Make runtime code. Do not mix Dona Antônia or any other project.