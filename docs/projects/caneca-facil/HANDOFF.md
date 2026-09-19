# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`. Architecture authority remains the own-chat redesign spec and master roadmap.

## Current checkpoint
Phase A is complete. Phase B — Conversational AI is active. Deterministic briefing merge/readiness, bounded rich components, typed interpreter boundary, deterministic simulation and production OpenAI structured adapter are implemented.

The orchestration core is now implemented in `apps/api/src/ai/conversation-orchestrator.ts`, behind `ConversationBriefingStore`. It blocks AI entirely for `human`/`paused`, applies extracted facts only through deterministic `mergeBriefing`/evaluation, versions changed briefing state when a project exists, and uses deterministic minimum-next-question logic. Functional orchestration commits: `c365ef2e`, `ec109a90`, `53c68258`.

Supabase was rechecked verbosely: existing conversations (`automation_mode`), messages (`structured_content`), mug_projects/current briefing and versioned briefings are sufficient for the next adapter/integration block. All reported public tables have RLS enabled; no migration is currently needed.

## Continue autonomously
1. Re-check branch head/recent commits before edits.
2. Implement Supabase `ConversationBriefingStore` using the existing schema; avoid migration unless a concrete gap is proven.
3. Extend assistant message completion to persist validated structured content.
4. Wire orchestration into own-chat turn flow. Never invoke/create AI reply while `automation_mode` is `human` or `paused`.
5. Validate every rich component, emit a bounded SSE component event, and persist the final assistant structured payload.
6. Add same-engine simulator/route coverage and Phase B acceptance evidence.
7. Run tests/typecheck/build/no-Meta guard; run Supabase advisors after DB/security changes.
8. Update this handoff and `CURRENT-STATE.md` after each substantial round.

Never reintroduce Meta, WhatsApp or Make runtime code. Do not mix Dona Antônia or any other project.