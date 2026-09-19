# Caneca Fácil — Current State

Updated: 2026-09-19

## Repository
Phase A base: `db92bf43d74235cdaca9d8794ad188c6ad871efe`.
Active implementation branch: `phase-b-conversational-ai`.
Draft PR: `#8` — do not merge until Phase B acceptance is green.

## Phase A
Complete and accepted. Own chat, anonymous session, SSE, provider-neutral messages, durable history and private direct uploads are present. Active runtime is Meta/WhatsApp-free.

## Supabase
Project `ijquzclfijwfgwupoxmg` remains the authority. Existing schema contains conversation ownership, structured messages, projects, versioned briefings, mug templates and private media foundations with RLS. No schema change was made in this round because Round 3 persistence gaps must be proven before migration.

## Phase B
Round 1 implementation is complete: Supabase briefing adapter, real turn orchestration, structured assistant content, validated component SSE, retry replay, OpenAI backend adapter and ownership gates.

Round 2 remains in final CI verification. PR CI run `35426095848` proved Test, Typecheck, anti-Meta guard and production Build are green. The only remaining failure is the production API smoke: Node ESM could not resolve `packages/core/dist/phone` imported by `dist/customer.js`. Commit `547ed7f4` fixes the source import to `./phone.js`; a fresh PR CI must prove the runtime smoke before Phase B is marked accepted.

## Phase C
Round 3 started on work independent of the Phase B CI gate. `packages/core/src/storefront.ts` defines authoritative catalog item/query contracts plus deterministic active-only search, tag/price/capacity filtering, contextual recommendation ranking and bounded compare semantics. Tests cover search, ranking and exclusion of inactive models. Commits: `75bba165`, `9bd0c3fb`, `4cdec552`.

## Next executable work
1. Require fully green PR #8 CI including production API smoke after `547ed7f4`; then mark Phase B accepted.
2. Continue Round 3 persistence/API layer for catalog search/recommend/compare/select/project binding.
3. Add Supabase migration only if existing `mug_templates` cannot represent authoritative storefront fields safely.
4. Keep pricing and selection server-authoritative and deterministic.
