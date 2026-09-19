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
Phase A is complete. Round 1 is complete. Round 2 remains at its final CI gate; Round 3 has begun in parallel where independent.

Round 1 integrated Phase B intelligence into the real own-chat turn path: transactional Supabase briefing store, orchestrator, `ai | human | paused` gate, validated component SSE, durable assistant `structured_content`, retry replay and optional backend-only OpenAI runtime.

Round 2 added same-engine multi-turn acceptance coverage and `docs/acceptance/phase-b-conversational-ai.md`. PR CI run `35426095848` proved tests, typecheck, anti-Meta and production Build green. Its only failure was production API smoke because Node ESM could not resolve `packages/core/dist/phone` from `dist/customer.js`. Commit `547ed7f4` changes the internal core import to `./phone.js`. Await/inspect fresh PR CI and mark Phase B ACCEPTED only after smoke is green.

Round 3 independent work has started: deterministic server-authoritative storefront contracts/search/filter/recommendation/compare live in `packages/core/src/storefront.ts` with tests. Commits: `75bba165`, `9bd0c3fb`, `4cdec552`.

## Continue autonomously
1. Inspect newest PR #8 CI after `547ed7f4` / this documentation checkpoint.
2. Fix any remaining CI failure until tests, typecheck, no-Meta, build and production API smoke are all green.
3. Mark Phase B ACCEPTED only after that green run.
4. Continue Round 3: persist authoritative catalog fields/tags/pricing, implement repository/API search/recommend/compare/select and project binding; add migration only for proven schema gaps.
5. Keep external credentials out of the critical path; use interfaces/mocks where needed.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
