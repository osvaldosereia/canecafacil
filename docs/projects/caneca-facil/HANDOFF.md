# Caneca Fácil — Handoff

Read this file first in every continuation.

## Sources of truth
Repository: `osvaldosereia/canecafacil`
Supabase: `ijquzclfijwfgwupoxmg`
Active branch: `phase-b-conversational-ai`
Draft PR: `#8` — do not merge until Phase B is accepted.
Historical only: `osvaldosereia/CHAT`

Then read `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS.md`.

## Current checkpoint
Phase A is complete. Final autonomous plan: Round 1 complete; Round 2 is in final verification.

Round 1 integrated Phase B intelligence into the real own-chat turn path: transactional Supabase briefing store, orchestrator, `ai | human | paused` gate, validated component SSE, durable assistant `structured_content`, retry replay and optional backend-only OpenAI runtime.

Round 2 added a same-engine multi-turn acceptance scenario and `docs/acceptance/phase-b-conversational-ai.md`. It also diagnosed a production-only NodeNext workspace typing failure that did not appear in tests/typecheck. Fixes now make `@caneca-facil/core` expose source types to workspace consumers and use explicit `.js` specifiers in its public TypeScript barrel, while runtime imports continue to use built `dist` JavaScript.

Relevant Round 2 commits: `c55e2f70`, `42a0cea2`, `54dc42b1`, `6835571a`, `ec8a122e`.

## Continue autonomously
1. Inspect the newest PR #8 CI generated after `6835571a`/`ec8a122e`.
2. Fix any remaining CI failure until tests, typecheck, no-Meta, build and production API smoke are all green.
3. Mark Phase B acceptance ACCEPTED only after that green run.
4. Update CURRENT-STATE and this handoff with the green run evidence.
5. Immediately begin Round 3: Intelligent Storefront backend — authoritative mug/model catalog, tags/search/filter/recommendation, compare/select and project binding.
6. Keep external credentials out of the critical path; use interfaces/mocks where needed.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
