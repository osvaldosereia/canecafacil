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

Round 2 added same-engine multi-turn acceptance coverage and `docs/acceptance/phase-b-conversational-ai.md`. CI run `35423599351` at `d78fe22b` passed tests, typecheck and no-Meta but still failed production Build, so Phase B must NOT yet be marked accepted. Commit `3296ff73` corrected the package boundary so workspace consumers resolve `@caneca-facil/core` from built `dist` declarations/runtime consistently under NodeNext. Await/inspect the next PR CI and continue fixing until Build + production API smoke are green.

Round 3 independent work has started: deterministic server-authoritative storefront contracts/search/filter/recommendation/compare live in `packages/core/src/storefront.ts` with tests. Commits: `75bba165`, `9bd0c3fb`, `4cdec552`.

## Continue autonomously
1. Inspect newest PR #8 CI after `3296ff73` and subsequent storefront commits.
2. Fix any remaining CI failure until tests, typecheck, no-Meta, build and production API smoke are all green.
3. Mark Phase B ACCEPTED only after that green run.
4. Continue Round 3: persist authoritative catalog fields/tags/pricing, implement repository/API search/recommend/compare/select and project binding; add migration only for proven schema gaps.
5. Keep external credentials out of the critical path; use interfaces/mocks where needed.
6. Update CURRENT-STATE/HANDOFF after substantial progress.

Never reintroduce Meta, WhatsApp or Make runtime code. Never program in `osvaldosereia/CHAT`. Do not mix Dona Antônia or any other project.
